import { NextRequest, NextResponse } from "next/server";
import { createHash, createPublicKey, publicEncrypt, constants, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys } from "@/db/schema";
import { jwtSecret } from "@/server/config";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

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
    if (typeof body.sourceDeviceId !== "string" || typeof body.targetDeviceId !== "string" || typeof body.targetFingerprint !== "string") return jsonError(422, "Device IDs and verified fingerprint are required.");
    const [source] = await db.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, body.sourceDeviceId), isNotNull(e2eeKeys.trustedAt))).limit(1);
    const [target] = await db.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, body.targetDeviceId))).limit(1);
    if (!source || !target || source.deviceId === target.deviceId) return jsonError(403, "Use an existing trusted device to approve your new device.");
    // Fingerprint is SHA-256 of the encoded public key, exactly as displayed on both devices.
    const targetHash = digest(target.publicKey);
    if (body.targetFingerprint !== targetHash) return jsonError(409, "Device fingerprint changed. Verify it again.");
    const nonce = randomBytes(32).toString("base64url");
    let encryptedChallenge: string;
    try {
      const key = createPublicKey({ key: Buffer.from(source.publicKey, "base64"), type: "spki", format: "der" });
      encryptedChallenge = publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(nonce)).toString("base64");
    } catch { return jsonError(422, "Trusted device key cannot be used for approval."); }
    const token = await new SignJWT({ source: source.deviceId, sourceHash: digest(source.publicKey), target: target.deviceId, targetHash, nonceHash: digest(nonce) })
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
    const approved = await db.transaction(async tx => {
      const [source] = await tx.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, sourceId))).for("update");
      const [target] = await tx.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, targetId))).for("update");
      if (!source?.trustedAt || !target || digest(source.publicKey) !== payload.sourceHash || digest(target.publicKey) !== payload.targetHash) return false;
      await tx.update(e2eeKeys).set({ trustedAt: new Date() }).where(eq(e2eeKeys.id, target.id));
      return true;
    });
    return approved ? NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } }) : jsonError(403, "Device trust changed. Verify the devices again.");
  } catch { return jsonError(403, "Approval expired or could not be verified. Start again."); }
}
