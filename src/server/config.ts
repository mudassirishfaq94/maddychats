import { createHash } from "crypto";

/** Name of the HttpOnly session cookie. */
export const SESSION_COOKIE = "maddy_session";

/**
 * Absolute device lifetime; access cookies last only fifteen minutes.
 */
function sessionTtlDays(): number {
  const configured = Number(process.env.SESSION_TTL_DAYS);
  return Number.isFinite(configured) && configured >= 1
    ? Math.min(Math.floor(configured), 90)
    : 30;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * sessionTtlDays();
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_COOKIE = "maddy_refresh";

let cachedSecret: Uint8Array | null = null;
let warned = false;

/**
 * Secret used to sign session JWTs (HS256).
 *
 * Priority:
 *  1. JWT_SECRET (32+ chars) — the correct production configuration.
 *  2. A deterministic key derived from server-only env (DATABASE_URL).
 *     Some hosts sanitize custom env vars between restarts; a random
 *     fallback would make every isolated execution context (proxy, route
 *     handlers, RSC) mint its own key and fail to verify each other's
 *     tokens. Deriving from stable server env keeps signing consistent
 *     everywhere and across restarts, without hardcoding any secret
 *     into the repository.
 *
 * SECURITY NOTE: The fallback derived key is NOT cryptographically secure
 * and should NEVER be used in production. Always set JWT_SECRET in production.
 */
export function jwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const raw = process.env.JWT_SECRET;
  if (raw && raw.length >= 32) {
    cachedSecret = new TextEncoder().encode(raw);
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be configured with at least 32 characters in production.");
  }

  if (!warned) {
    warned = true;
    console.warn(
      "[maddy-chats] SECURITY WARNING: JWT_SECRET is not set (or <32 chars). " +
        "Using a derived key for development only. This is NOT secure for production. " +
        "Set JWT_SECRET (openssl rand -hex 32) for production deployment.",
    );
  }

  // Add additional entropy to the derived key to reduce predictability
  const material = `maddy-chats|jwt|${process.env.DATABASE_URL ?? "local-development"}|${process.cwd()}`;
  cachedSecret = createHash("sha256").update(material).digest();
  return cachedSecret;
}

/** Public origin of the client application. */
export function clientUrl(): string {
  const url =
    process.env.CLIENT_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return url.replace(/\/+$/, "");
}

/** Exact OAuth callback registered with Google; defaults to this app origin. */
export function googleCallbackUrl(): string {
  const expected = `${clientUrl()}/api/auth/google/callback`;
  const configured = process.env.GOOGLE_CALLBACK_URL;
  if (configured && configured !== expected) {
    throw new Error("GOOGLE_CALLBACK_URL must match CLIENT_URL + /api/auth/google/callback.");
  }
  return expected;
}

/**
 * Session cookies are marked Secure when the app is served over HTTPS
 * (production-style), and left off for local HTTP development so sessions
 * still work on http://localhost.
 */
export function cookieSecure(): boolean {
  return clientUrl().startsWith("https://");
}
