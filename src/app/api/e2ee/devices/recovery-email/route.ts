import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { deviceSessions, e2eeKeys, users } from "@/db/schema";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson, clientIp } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { verifyFreshAuthentication } from "@/server/authentication";
import { issueDeviceRecoveryEmailCode, deviceRecoveryEmailConfigured } from "@/server/device-recovery-email";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in before requesting device recovery.");
  if (!await verifyFreshAuthentication(user.id, null)) return jsonError(403, "Sign in again with Google or your account provider before requesting a recovery code.");
  const [account] = await db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!account?.emailVerifiedAt || user.email.endsWith("@auth.maddychats.invalid")) return jsonError(409, "This account has no verified email address for recovery. Sign in again or use a saved recovery file.");
  if (!deviceRecoveryEmailConfigured()) return jsonError(503, "Email recovery is temporarily unavailable. Use a trusted device or saved recovery file.");

  const ipLimit = await rateLimit(`e2ee-recovery-email-ip:${clientIp(req)}`, 5, 15 * 60 * 1000);
  const userLimit = await rateLimit(`e2ee-recovery-email-user:${user.id}`, 3, 15 * 60 * 1000);
  if (!ipLimit.allowed || !userLimit.allowed) return jsonError(429, "Too many recovery-code requests. Please wait before trying again.");

  const sessionId = await getSessionDeviceId();
  const body = await readJson(req);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
  const fingerprint = typeof body?.fingerprint === "string" ? body.fingerprint : "";
  if (!sessionId || !deviceId || deviceId.length > 128 || !/^[a-f0-9]{64}$/.test(fingerprint)) return jsonError(422, "Refresh this browser's pending encryption device, then request a new code.");
  const [session] = await db.select({ id: deviceSessions.id }).from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).limit(1);
  const [key] = await db.select({ publicKey: e2eeKeys.publicKey }).from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId), eq(e2eeKeys.sessionId, sessionId), isNull(e2eeKeys.trustedAt))).limit(1);
  if (!session || !key) return jsonError(409, "The open browser is not a pending device for this session. Refresh the device list and try again.");
  if (createHash("sha256").update(key.publicKey).digest("hex") !== fingerprint) return jsonError(409, "This device's encryption fingerprint changed. Refresh and verify it again.");

  const result = await issueDeviceRecoveryEmailCode({ user: { id: user.id, email: user.email, emailVerifiedAt: account.emailVerifiedAt }, deviceId, sessionId, fingerprint });
  if (result === "cooldown") return jsonError(429, "A recovery code was requested recently. Wait one minute before requesting another.");
  if (result !== "sent") return jsonError(503, "We could not send the recovery email. Wait one minute, then try again.");
  return NextResponse.json({ ok: true, expiresInSeconds: 600 }, { headers: { "Cache-Control": "private, no-store" } });
}
