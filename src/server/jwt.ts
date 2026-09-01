import { SignJWT, jwtVerify } from "jose";
import { SESSION_TTL_SECONDS, jwtSecret } from "./config";

const ISSUER = "maddy-chats";
const AUDIENCE = "maddy-chats-web";

export interface SessionClaims {
  /** User id (uuid). */
  sub: string;
  /** Username snapshot (display convenience only). */
  usr: string;
  /** Issued-at (unix seconds), required by the JWT standard flow. */
  iat: number;
  /** Signed millisecond issuance time for precise logout revocation. */
  iatMs: number;
}

export async function signSessionToken(
  userId: string,
  username: string,
): Promise<string> {
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  return new SignJWT({ usr: username, iatMs: nowMs })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(jwtSecret());
}

/** Returns verified claims, or null when the token is missing/invalid/expired. */
export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      !payload.sub ||
      typeof payload.usr !== "string" ||
      !payload.iat ||
      typeof payload.iatMs !== "number" ||
      !Number.isFinite(payload.iatMs)
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      usr: payload.usr,
      iat: payload.iat,
      iatMs: payload.iatMs,
    };
  } catch {
    return null;
  }
}
