import { publicKeyFingerprint } from "@/server/device-inventory";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceLinkRequests, deviceSessions, e2eeKeys } from "@/db/schema";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { detectCountry } from "@/server/country";
import { platformLabel } from "@/server/device-meta";
import { linkCodeHash, normalizeLinkCode } from "@/server/device-link-code";

export const dynamic = "force-dynamic";

const MAX_DEVICE_NAME = 60;

/**
 * The new device redeems the code that was generated on a trusted device of the
 * same account. The code is single-use and short-lived, and the trusted device
 * must still be trusted when it is redeemed, so revoking it invalidates an
 * unredeemed code too.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const sessionId = await getSessionDeviceId();
  if (!sessionId) return jsonError(409, "Sign in again to link this browser.");

  if (!(await rateLimit(`device-link-verify:${user.id}`, 10, 60000)).allowed) {
    return jsonError(429, "Too many attempts. Please wait.");
  }

  const body = await readJson(req);
  const code = normalizeLinkCode(typeof body?.code === "string" ? body.code : null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  if (!code) return jsonError(422, "Enter the 8-character code from your trusted device.");
  if (!deviceId || deviceId.length > 100) return jsonError(422, "Device ID is required.");

  const requestedName = typeof body?.deviceName === "string" ? body.deviceName.trim().slice(0, MAX_DEVICE_NAME) : "";
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const detectedCountry = await detectCountry(req);

  const outcome = await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ id: deviceSessions.id })
      .from(deviceSessions)
      .where(and(
        eq(deviceSessions.id, sessionId),
        eq(deviceSessions.userId, user.id),
        isNull(deviceSessions.revokedAt),
        gt(deviceSessions.expiresAt, new Date()),
      ))
      .for("update");
    if (!session) return "session" as const;

    const [request] = await tx
      .select({
        id: deviceLinkRequests.id,
        sessionId: deviceLinkRequests.sessionId,
        sourceDeviceId: deviceLinkRequests.sourceDeviceId,
        codeHash: deviceLinkRequests.codeHash,
        fingerprint: deviceLinkRequests.fingerprint,
      })
      .from(deviceLinkRequests)
      .where(and(
        eq(deviceLinkRequests.userId, user.id),
        eq(deviceLinkRequests.deviceId, deviceId),
        eq(deviceLinkRequests.status, "pending"),
        eq(deviceLinkRequests.codeHash, linkCodeHash(code)),
        gt(deviceLinkRequests.expiresAt, new Date()),
        isNull(deviceLinkRequests.usedAt),
      ))
      .for("update");
    if (!request) return "code" as const;

    // Trust is transitive only while the issuing device is still trusted. Older
    // requests recorded only a session, so fall back to that binding.
    const [sourceDevice] = await tx
      .select({ deviceId: e2eeKeys.deviceId, trustedAt: e2eeKeys.trustedAt })
      .from(e2eeKeys)
      .where(and(
        eq(e2eeKeys.userId, user.id),
        request.sourceDeviceId ? eq(e2eeKeys.deviceId, request.sourceDeviceId) : eq(e2eeKeys.sessionId, request.sessionId),
      ))
      .for("update");
    if (!sourceDevice || !sourceDevice.trustedAt) return "source" as const;

    const [target] = await tx
      .select({ id: e2eeKeys.id, deviceName: e2eeKeys.deviceName, country: e2eeKeys.country, publicKey: e2eeKeys.publicKey, sessionId: e2eeKeys.sessionId })
      .from(e2eeKeys)
      .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId)))
      .for("update");
    if (!target) return "unknown" as const;
    if (target.sessionId !== sessionId || publicKeyFingerprint(target.publicKey) !== request.fingerprint) return "code" as const;

    await tx
      .update(e2eeKeys)
      .set({
        trustedAt: new Date(),
        // Rebind to the session that just proved the code, so a later sign-in on
        // this browser keeps pointing at this key row.
        sessionId,
        lastUsedAt: new Date(),
        platform: platformLabel(userAgent),
        deviceName: requestedName || target.deviceName,
        country: target.country ?? detectedCountry,
        ipCountry: detectedCountry,
        ipCountryAt: detectedCountry ? new Date() : undefined,
      })
      .where(eq(e2eeKeys.id, target.id));

    await tx
      .update(deviceLinkRequests)
      .set({ status: "approved", usedAt: new Date() })
      .where(eq(deviceLinkRequests.id, request.id));

    return "ok" as const;
  });

  if (outcome === "session") return jsonError(409, "Sign in again to link this browser.");
  if (outcome === "unknown") return jsonError(409, "Reload this page so this browser is registered, then enter the code again.");
  if (outcome !== "ok") return jsonError(403, "That linking code is invalid, expired, or already used.");

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
