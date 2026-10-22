import { SignJWT, jwtVerify } from "jose";
import { ACCESS_TTL_SECONDS, SESSION_TTL_SECONDS, jwtSecret } from "./config";

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
  authTime: number;
  mfaTime: number;
  sid?: string;
  devicePending?: boolean;
}

export async function signSessionToken(
  userId: string,
  username: string,
  authTime = 0,
  mfaTime = 0,
  sid?: string,
  devicePending = false,
): Promise<string> {
  const nowMs = Date.now();
  const now = Math.floor(nowMs / 1000);
  return new SignJWT({ usr: username, iatMs: nowMs, authTime, mfaTime, ...(sid ? { sid } : {}), ...(devicePending ? { devicePending: true } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + (sid ? ACCESS_TTL_SECONDS : SESSION_TTL_SECONDS))
    .sign(jwtSecret());
}

/** Returns verified claims, or null when the token is missing/invalid/expired. */
export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    if (token.length > 8192) return null;
    const { payload } = await jwtVerify(token, jwtSecret(), {
      algorithms: ["HS256"], typ: "JWT", requiredClaims: ["sub", "iat", "exp", "iss", "aud"],
      issuer: ISSUER,
      audience: AUDIENCE,
      maxTokenAge: SESSION_TTL_SECONDS,
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
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(payload.sub) || (payload.sid !== undefined && (typeof payload.sid !== "string" || !uuid.test(payload.sid))) ||
      !Number.isSafeInteger(payload.iatMs) || Math.floor(payload.iatMs / 1000) !== payload.iat ||
      typeof payload.exp !== "number" || payload.exp - payload.iat > (payload.sid ? ACCESS_TTL_SECONDS : SESSION_TTL_SECONDS) ||
      [payload.authTime ?? 0, payload.mfaTime ?? 0].some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > Date.now() + 30000)) return null;
    return {
      sub: payload.sub,
      usr: payload.usr,
      iat: payload.iat,
      iatMs: payload.iatMs,
      mfaTime: typeof payload.mfaTime === "number" && Number.isFinite(payload.mfaTime) ? payload.mfaTime : 0,
      authTime: typeof payload.authTime === "number" && Number.isFinite(payload.authTime) ? payload.authTime : 0,
      sid: typeof payload.sid === "string" ? payload.sid : undefined,
      devicePending: payload.devicePending === true,
    };
  } catch {
    return null;
  }
}
