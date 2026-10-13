import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceLinkRequests, deviceSessions, e2eeKeys } from "@/db/schema";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { verifyFreshAuthentication } from "@/server/authentication";
import { isUuid } from "@/server/users";
import { rateLimit } from "@/server/rate-limit";
import { deviceInventory } from "@/server/device-inventory";

export const dynamic = "force-dynamic";

/**
 * Devices are reported per registered encryption device, not per cookie
 * session. Trust is read from `e2eeKeys.trustedAt` for that device id, so a
 * device that was approved once still reads as trusted after signing in again.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const current = await getSessionDeviceId();
  const { devices, unboundSessions } = await deviceInventory(user.id, current ?? null);
  return NextResponse.json(
    { devices, unboundSessions, currentSessionId: current ?? null, legacy: !current },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Revoking a session also drops the encryption trust of the device bound to it. */
export async function DELETE(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request.");
  if (!(await rateLimit(`device-revoke:${user.id}`, 10, 600000)).allowed) {
    return jsonError(429, "Too many attempts. Try again later.");
  }
  if (!(await verifyFreshAuthentication(user.id, body))) {
    return jsonError(403, "Confirm your identity to revoke devices.");
  }
  const current = await getSessionDeviceId();

  const outcome = await db.transaction(async (tx) => {
    if (body.allOthers === true) {
      if (!current) return jsonError(409, "Sign in again to manage this device.");
      // Lock in a stable order so revocation cannot deadlock with approval.
      await tx.select({ id: deviceSessions.id }).from(deviceSessions).where(eq(deviceSessions.userId, user.id)).orderBy(deviceSessions.id).for("update");
      const revoked = await tx
        .update(deviceSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(deviceSessions.userId, user.id), ne(deviceSessions.id, current)))
        .returning({ id: deviceSessions.id });
      if (revoked.length) {
        const revokedIds = revoked.map((row) => row.id);
        await tx.update(e2eeKeys).set({ trustedAt: null }).where(and(eq(e2eeKeys.userId, user.id), inArray(e2eeKeys.sessionId, revokedIds)));
        await tx.update(deviceLinkRequests).set({ status: "revoked" }).where(and(eq(deviceLinkRequests.userId, user.id), inArray(deviceLinkRequests.sessionId, revokedIds)));
      }
      return null;
    }
    if (typeof body.id !== "string" || !isUuid(body.id)) return jsonError(422, "Invalid device.");
    const result = await tx
      .update(deviceSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(deviceSessions.id, body.id), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt)))
      .returning({ id: deviceSessions.id });
    if (!result.length) return jsonError(404, "Device not found.");
    await tx.update(e2eeKeys).set({ trustedAt: null }).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.sessionId, body.id)));
    await tx.update(deviceLinkRequests).set({ status: "revoked" }).where(and(eq(deviceLinkRequests.userId, user.id), eq(deviceLinkRequests.sessionId, body.id)));
    return null;
  });

  if (outcome) return outcome;
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
