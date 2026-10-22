import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "./config";
import { POLICY_VERSION } from "@/lib/policy-consent";

const ISSUER = "circlo";
const AUDIENCE = "circlo-google-mobile-handoff";
const TTL_SECONDS = 120;

export async function createGoogleMobileHandoff(
  userId: string,
  username: string,
  codeChallenge: string,
): Promise<string> {
  return new SignJWT({ usr: username, codeChallenge, policyVersion: POLICY_VERSION, issuedAtMs: Date.now() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(jwtSecret());
}

export async function verifyGoogleMobileHandoff(ticket: string): Promise<{
  userId: string;
  username: string;
  codeChallenge: string;
  issuedAtMs: number;
} | null> {
  try {
    const { payload } = await jwtVerify(ticket, jwtSecret(), {
      algorithms: ["HS256"], typ: "JWT", requiredClaims: ["sub", "iat", "exp", "iss", "aud"], maxTokenAge: TTL_SECONDS,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      payload.policyVersion !== POLICY_VERSION ||
      typeof payload.sub !== "string" ||
      typeof payload.usr !== "string" ||
      typeof payload.codeChallenge !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(payload.codeChallenge) ||
      typeof payload.issuedAtMs !== "number" || !Number.isSafeInteger(payload.issuedAtMs) || payload.issuedAtMs > Date.now() + 30000 ||
      typeof payload.exp !== "number" || typeof payload.iat !== "number" || payload.exp - payload.iat > TTL_SECONDS || Math.abs(payload.issuedAtMs - payload.iat * 1000) >= 1000
    ) return null;
    return { userId: payload.sub, username: payload.usr, codeChallenge: payload.codeChallenge, issuedAtMs: payload.issuedAtMs };
  } catch {
    return null;
  }
}
