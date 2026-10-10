import { NextRequest, NextResponse } from "next/server";
import { createHash, createPublicKey, publicEncrypt, constants, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNotNull, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys, deviceLinkRequests, deviceSessions, users } from "@/db/schema";
import { jwtSecret, SESSION_COOKIE } from "@/server/config";
import { getSessionUser, getSessionDeviceId, getSessionAuthTime, getSessionMfaTime, createSessionToken, sessionCookieOptions } from "@/server/session";
import { guardSameOrigin, jsonError, readJson, requestIsSecure } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { isUuid } from "@/server/users";
import { verifyFreshAuthentication } from "@/server/authentication";

export const dynamic = "force-dynamic";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const audience = "ziptalks:e2ee-device-approval";

/** Account login alone cannot approve devices: prove possession of a trusted private key. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`e2ee-approval:${user.id}`, 20, 60000)).allowed) return jsonError(429, "Too many approval attempts. Please wait.");
  const body = await readJson(req) as Record<string, unknown> | null;
  if (body?.action === "challenge") {
    const binding = body.decision === "bind-session";
    const recovery = body.decision === "recover";
    const selfProof = binding || recovery;
    const sessionId = selfProof ? await getSessionDeviceId() : undefined;
    if (selfProof && !sessionId) return jsonError(409, "Sign in again to register this device session.");
    if (recovery) {
      if (body.confirmation !== "RESET ENCRYPTION TRUST") return jsonError(422, "Confirm that your old trusted devices are unavailable. Historical keys will not be replaced.");
      if (!(await rateLimit(`e2ee-recovery:${user.id}`, 5, 600000)).allowed) return jsonError(429, "Too many recovery attempts. Please wait.");
      if (!(await verifyFreshAuthentication(user.id, body))) return jsonError(403, "Confirm your identity: sign in again, or provide your password and authenticator/recovery code when enabled.");
    }
    if (typeof body.sourceDeviceId !== "string" || typeof body.targetDeviceId !== "string" || typeof body.targetFingerprint !== "string") return jsonError(422, "Device IDs and verified fingerprint are required.");
    const [source] = await db.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, body.sourceDeviceId), ...(selfProof ? [] : [isNotNull(e2eeKeys.trustedAt)]))).limit(1);
    const [target] = await db.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, body.targetDeviceId))).limit(1);
    if (!source || !target || (selfProof ? source.deviceId !== target.deviceId : source.deviceId === target.deviceId)) return jsonError(403, "Use an existing trusted device to approve your new device.");
    if (recovery && (target.trustedAt || target.sessionId !== sessionId)) return jsonError(409, "Recovery must enroll this browser's pending encryption key. Refresh devices and try again.");
    // Fingerprint is SHA-256 of the encoded public key, exactly as displayed on both devices.
    const targetHash = digest(target.publicKey);
    if (body.targetFingerprint !== targetHash) return jsonError(409, "Device fingerprint changed. Verify it again.");
    let linkId: string | undefined;
    const decision = body.decision === "reject" ? "reject" : "approve";
    if (typeof body.linkId === "string") {
      if (selfProof) return jsonError(422, "Session registration or recovery cannot approve a linking request.");
      if (!isUuid(body.linkId)) return jsonError(422, "Invalid linking request.");
      const [link] = await db.select().from(deviceLinkRequests).where(and(eq(deviceLinkRequests.id, body.linkId), eq(deviceLinkRequests.userId, user.id), eq(deviceLinkRequests.deviceId, target.deviceId), eq(deviceLinkRequests.status, "pending"), gt(deviceLinkRequests.expiresAt, new Date()))).limit(1);
      if (!link || link.fingerprint !== targetHash) return jsonError(409, "Linking request expired or was already used.");
      const [session] = await db.select({ id: deviceSessions.id }).from(deviceSessions).where(and(eq(deviceSessions.id, link.sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).limit(1);
      if (!session || (decision === "approve" && (typeof body.code !== "string" || digest(body.code.replace(/\s|-/g, "").toUpperCase()) !== link.codeHash))) return jsonError(403, "Linking code does not match this device.");
      linkId = link.id;
    } else if (decision === "reject") return jsonError(422, "A linking request is required.");
    const nonce = randomBytes(32).toString("base64url");
    let encryptedChallenge: string;
    try {
      const key = createPublicKey({ key: Buffer.from(source.publicKey, "base64"), type: "spki", format: "der" });
      encryptedChallenge = publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(nonce)).toString("base64");
    } catch { return jsonError(422, "Trusted device key cannot be used for approval."); }
    const token = await new SignJWT({ source: source.deviceId, sourceHash: digest(source.publicKey), target: target.deviceId, targetHash, nonceHash: digest(nonce), ...(selfProof ? { decision: recovery ? "recover" : "bind-session", sessionId } : linkId ? { linkId, decision } : {}) })
      .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setAudience(audience).setIssuedAt().setExpirationTime("2m").setJti(randomBytes(16).toString("hex")).sign(jwtSecret());
    return NextResponse.json({ token, encryptedChallenge }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body?.action !== "approve" || typeof body.token !== "string" || typeof body.proof !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.proof)) return jsonError(422, "Approval proof is required.");
  try {
    const { payload } = await jwtVerify(body.token, jwtSecret(), { algorithms: ["HS256"], audience });
    if (payload.sub !== user.id || typeof payload.jti !== "string" || typeof payload.source !== "string" || typeof payload.target !== "string" || typeof payload.nonceHash !== "string" || typeof payload.targetHash !== "string" || typeof payload.sourceHash !== "string") return jsonError(403, "Invalid device approval.");
    const expected = Buffer.from(payload.nonceHash, "hex"), actual = Buffer.from(digest(body.proof), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return jsonError(403, "Trusted device proof is invalid.");
    if (!(await rateLimit(`e2ee-approval-proof:${payload.jti}`, 1, 120000)).allowed) return jsonError(409, "This approval proof was already used. Start again.");
    const sourceId = payload.source, targetId = payload.target;
    const binding = payload.decision === "bind-session";
    const recovery = payload.decision === "recover";
    const selfProof = binding || recovery;
    if (selfProof && (payload.sessionId !== await getSessionDeviceId() || sourceId !== targetId || typeof payload.sessionId !== "string")) return jsonError(403, "Session registration does not match this browser.");
    const approved = await db.transaction(async tx => {
      if (recovery) {
        // Account -> sessions -> keys also matches global sign-out/registration.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
        // Lock sessions before keys, in stable order. Older browsers must not
        // keep using cached authorization after the explicit recovery reset.
        const sessions = await tx.select().from(deviceSessions).where(eq(deviceSessions.userId, user.id)).orderBy(deviceSessions.id).for("update");
        const session = sessions.find(row => row.id === payload.sessionId);
        if (!session || session.revokedAt || session.expiresAt <= new Date()) return false;
      } else if (selfProof) {
        const [session] = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, payload.sessionId as string), eq(deviceSessions.userId, user.id))).for("update");
        if (!session || session.revokedAt || session.expiresAt <= new Date()) return false;
      }
      // Match revocation's session -> key -> request lock order.
      if (typeof payload.linkId === "string") {
        const [pending] = await tx.select().from(deviceLinkRequests).where(and(eq(deviceLinkRequests.id, payload.linkId), eq(deviceLinkRequests.userId, user.id)));
        if (!pending) return false;
        const [session] = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, pending.sessionId), eq(deviceSessions.userId, user.id))).for("update");
        if (!session || session.revokedAt || session.expiresAt <= new Date()) return false;
      }
      // One order for every approval/recovery prevents reciprocal device deadlocks.
      const keys = await tx.select().from(e2eeKeys).where(eq(e2eeKeys.userId, user.id)).orderBy(e2eeKeys.id).for("update");
      const source = keys.find(key => key.deviceId === sourceId);
      const target = keys.find(key => key.deviceId === targetId);
      if (!source || (!selfProof && !source.trustedAt) || !target || digest(source.publicKey) !== payload.sourceHash || digest(target.publicKey) !== payload.targetHash) return false;
      if (recovery) {
        if (target.trustedAt || target.sessionId !== payload.sessionId) return false;
        // Explicit account recovery replaces trust, never private keys or chat history.
        await tx.update(deviceSessions).set({ revokedAt: new Date() }).where(and(eq(deviceSessions.userId, user.id), ne(deviceSessions.id, payload.sessionId as string), isNull(deviceSessions.revokedAt)));
        // Legacy cookies have no session ID, so revoke their older issuance too.
        await tx.update(users).set({ tokenInvalidBeforeAt: new Date() }).where(eq(users.id, user.id));
        await tx.update(e2eeKeys).set({ trustedAt: null }).where(eq(e2eeKeys.userId, user.id));
        await tx.update(e2eeKeys).set({ trustedAt: new Date() }).where(eq(e2eeKeys.id, target.id));
        await tx.update(deviceLinkRequests).set({ status: "revoked" }).where(and(eq(deviceLinkRequests.userId, user.id), eq(deviceLinkRequests.status, "pending")));
        return true;
      }
      if (binding) {
        // Possession rebinds the same key after sign-in; it never grants or restores trust.
        await tx.update(e2eeKeys).set({ sessionId: payload.sessionId as string }).where(eq(e2eeKeys.id, target.id));
        return true;
      }
      if (typeof payload.linkId === "string") {
        const [link] = await tx.select().from(deviceLinkRequests).where(and(eq(deviceLinkRequests.id, payload.linkId), eq(deviceLinkRequests.userId, user.id))).for("update");
        if (!link || link.status !== "pending" || link.expiresAt <= new Date() || link.deviceId !== targetId || link.fingerprint !== payload.targetHash) return false;
        await tx.update(deviceLinkRequests).set({ status: payload.decision === "reject" ? "rejected" : "approved" }).where(eq(deviceLinkRequests.id, link.id));
        if (payload.decision === "reject") return true;
      }
      await tx.update(e2eeKeys).set({ trustedAt: new Date() }).where(eq(e2eeKeys.id, target.id));
      return true;
    });
    if (!approved) return jsonError(403, "Device trust changed. Verify the devices again.");
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    if (recovery) {
      // Preserve the proven current session and its authentication/MFA times.
      response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id, user.username, await getSessionAuthTime(), await getSessionMfaTime(), payload.sessionId as string), sessionCookieOptions(requestIsSecure(req)));
    }
    return response;
  } catch { return jsonError(403, "Approval expired or could not be verified. Start again."); }
}
