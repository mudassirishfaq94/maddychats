import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "./config";

export const GOOGLE_EMAIL_PROOF_COOKIE = "maddy_google_email_proof";
export const GOOGLE_EMAIL_PROOF_AUDIENCE = "maddy-chats-email-verification";
export const GOOGLE_EMAIL_PROOF_ISSUER = "maddy-chats";
export const GOOGLE_EMAIL_PROOF_TTL = 300;
const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/** Created only after the Google callback has verified its signature, nonce and email. */
export async function createGoogleEmailProof(userId: string, email: string) {
  return new SignJWT({ emailHash: emailHash(email) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId).setIssuer(GOOGLE_EMAIL_PROOF_ISSUER)
    .setAudience(GOOGLE_EMAIL_PROOF_AUDIENCE).setJti(randomUUID())
    .setIssuedAt().setExpirationTime(`${GOOGLE_EMAIL_PROOF_TTL}s`).sign(jwtSecret());
}

/** This verifies email ownership only; login still requires the password and MFA. */
export async function readGoogleEmailProof(token: string | undefined, userId: string, email: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      algorithms: ["HS256"], issuer: GOOGLE_EMAIL_PROOF_ISSUER,
      audience: GOOGLE_EMAIL_PROOF_AUDIENCE, maxTokenAge: `${GOOGLE_EMAIL_PROOF_TTL}s`,
    });
    if (payload.sub !== userId || payload.emailHash !== emailHash(email)
      || typeof payload.jti !== "string" || !/^[0-9a-f-]{36}$/.test(payload.jti)
      || typeof payload.exp !== "number" || typeof payload.iat !== "number"
      || payload.exp - payload.iat > GOOGLE_EMAIL_PROOF_TTL) return null;
    return payload.jti;
  } catch { return null; }
}
