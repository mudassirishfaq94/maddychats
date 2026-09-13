import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "./config";

const ISSUER = "circlo";
const AUDIENCE = "circlo-google-mobile-handoff";
const TTL_SECONDS = 120;

export async function createGoogleMobileHandoff(
  userId: string,
  username: string,
  codeChallenge: string,
): Promise<string> {
  return new SignJWT({ usr: username, codeChallenge })
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
} | null> {
  try {
    const { payload } = await jwtVerify(ticket, jwtSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.usr !== "string" ||
      typeof payload.codeChallenge !== "string"
    ) return null;
    return { userId: payload.sub, username: payload.usr, codeChallenge: payload.codeChallenge };
  } catch {
    return null;
  }
}
