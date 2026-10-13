import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceLinkRequests, deviceSessions, e2eeKeys } from "@/db/schema";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { LINK_CODE_TTL_MS, generateLinkCode, linkCodeHash } from "@/server/device-link-code";
import { publicKeyFingerprint } from "@/server/device-inventory";

export const dynamic = "force-dynamic";

/**
 * A device that is already trusted mints a short-lived, single-use code for one
 * other device of the same account. The code is the human channel: it is shown
 * only on the trusted device and typed on the new one, and only its hash is
 * stored. The caller must itself hold a trusted key, so a stolen session for an
 * untrusted browser cannot approve anything.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const callerSessionId = await getSessionDeviceId();
  if (!callerSessionId) return jsonError(409, "Sign in again to generate a linking code.");

  if (!(await rateLimit(`device-link-code:${user.id}`, 10, 60000)).allowed) {
    return jsonError(429, "Please wait before generating another code.");
  }

  const body = await readJson(req);
  const targetDeviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  if (!targetDeviceId || targetDeviceId.length > 100) return jsonError(422, "Device ID is required.");

  const code = generateLinkCode();

  const result = await db.transaction(async (tx) => {
    const [callerSession] = await tx
      .select({ id: deviceSessions.id })
      .from(deviceSessions)
      .where(and(
        eq(deviceSessions.id, callerSessionId),
        eq(deviceSessions.userId, user.id),
        isNull(deviceSessions.revokedAt),
        gt(deviceSessions.expiresAt, new Date()),
      ))
      .for("update");
    if (!callerSession) return "session" as const;

    // The caller's own key row, resolved from its current session, is the only
    // device allowed to hand out trust.
    const [callerDevice] = await tx
      .select({ deviceId: e2eeKeys.deviceId, trustedAt: e2eeKeys.trustedAt })
      .from(e2eeKeys)
      .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.sessionId, callerSessionId)))
      .for("update");
    if (!callerDevice) return "unbound" as const;
    if (!callerDevice.trustedAt) return "untrusted" as const;
    if (callerDevice.deviceId === targetDeviceId) return "self" as const;

    const [targetDevice] = await tx
      .select({ id: e2eeKeys.id, publicKey: e2eeKeys.publicKey, trustedAt: e2eeKeys.trustedAt })
      .from(e2eeKeys)
      .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, targetDeviceId)))
      .for("update");
    if (!targetDevice) return "unknown" as const;
    if (targetDevice.trustedAt) return "already" as const;

    // One live code per device: a second request invalidates the first.
    await tx
      .update(deviceLinkRequests)
      .set({ status: "revoked", usedAt: new Date() })
      .where(and(
        eq(deviceLinkRequests.userId, user.id),
        eq(deviceLinkRequests.deviceId, targetDeviceId),
        eq(deviceLinkRequests.status, "pending"),
      ));

    const [request] = await tx
      .insert(deviceLinkRequests)
      .values({
        userId: user.id,
        sessionId: callerSessionId,
        sourceDeviceId: callerDevice.deviceId,
        deviceId: targetDeviceId,
        fingerprint: publicKeyFingerprint(targetDevice.publicKey),
        codeHash: linkCodeHash(code),
        status: "pending",
        expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      })
      .returning({ id: deviceLinkRequests.id, expiresAt: deviceLinkRequests.expiresAt });

    return { id: request.id, code, expiresAt: request.expiresAt };
  });

  if (typeof result === "string") {
    if (result === "self") return jsonError(422, "This device is already trusted.");
    if (result === "already") return jsonError(409, "That device is already trusted.");
    if (result === "unknown") return jsonError(404, "That device is not registered on this account yet.");
    if (result === "session") return jsonError(409, "Sign in again to generate a linking code.");
    if (result === "unbound") return jsonError(409, "Reload this page so this browser can be recognized.");
    return jsonError(403, "Only a trusted device can generate a linking code.");
  }

  return NextResponse.json(
    { id: result.id, code: result.code, expiresAt: result.expiresAt.toISOString() },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

