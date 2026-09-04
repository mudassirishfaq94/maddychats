import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  cookieSecure,
} from "./config";
import { signSessionToken, verifySessionToken } from "./jwt";
import { findUserById, toSafeUser, touchLastSeen } from "./users";
import type { SafeUser } from "@/lib/types";

/** Attributes applied to the session cookie (matches NextResponse cookie API). */
export interface SessionCookieOptions {
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
  path: string;
  maxAge: number;
}

/**
 * Cookie attributes for the session cookie.
 *
 * SameSite=Lax prevents cross-site form submissions from carrying the session
 * cookie while preserving normal top-level navigation and OAuth callbacks.
 * Secure remains conditional so local http://localhost development works.
 */
export function sessionCookieOptions(
  secureTransport: boolean = cookieSecure(),
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: secureTransport,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createSessionToken(
  userId: string,
  username: string,
): Promise<string> {
  return signSessionToken(userId, username);
}

/**
 * Resolves the current session from the request cookies.
 * Returns null when unauthenticated or when the token no longer maps to a
 * user (e.g. account deleted).
 */
export async function getSessionUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  const user = await findUserById(claims.sub);
  if (!user) return null;
  // Revocation: a signed millisecond issuance claim avoids JWT `iat`'s
  // second-granularity ambiguity. A copied cookie issued at or before the
  // logout watermark is dead, while an immediate re-login remains valid.
  if (
    user.tokenInvalidBeforeAt &&
    claims.iatMs <= user.tokenInvalidBeforeAt.getTime()
  ) {
    return null;
  }
  return toSafeUser(user);
}

/**
 * Like getSessionUser but also refreshes `lastSeenAt` when it is stale
 * (at most one write per minute per user).
 */
export async function getSessionUserWithPresence(): Promise<SafeUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
  if (Date.now() - lastSeen > 60_000) {
    await touchLastSeen(user.id);
    user.lastSeenAt = new Date().toISOString();
  }
  return user;
}
