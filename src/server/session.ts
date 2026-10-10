import { cache } from "react";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  ACCESS_TTL_SECONDS,
  cookieSecure,
} from "./config";
import { signSessionToken, verifySessionToken } from "./jwt";
import { findUserById, toSafeUser, touchLastSeen } from "./users";
import { is2FAEnabled, enabledMfaSince } from "./two-factor";
import type { UserRow } from "@/db/schema";
import type { SafeUser } from "@/lib/types";
import { activeDevice } from "./device-sessions";
import { retryDatabaseRead } from "./database-read-retry";

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
    maxAge: ACCESS_TTL_SECONDS,
  };
}

export async function createSessionToken(
  userId: string,
  username: string,
  authTime = 0,
  mfaTime = 0,
  sid?: string,
): Promise<string> {
  return signSessionToken(userId, username, authTime, mfaTime, sid);
}

/**
 * Central eligibility check for a *new* primary-authentication session.
 * Existing sessions have already completed their login ceremony, but a
 * suspended user must be rejected at every request by getSessionUser below.
 */
export async function newSessionBlockReason(
  user: UserRow,
): Promise<"suspended" | "mfa_required" | null> {
  if (
    user.suspendedAt &&
    (!user.suspendedUntil || user.suspendedUntil.getTime() >= Date.now())
  ) {
    return "suspended";
  }
  return (await is2FAEnabled(user.id)) ? "mfa_required" : null;
}

/**
 * Resolves the current session from the request cookies.
 * Returns null when unauthenticated or when the token no longer maps to a
 * user (e.g. account deleted).
 */
// Request-scoped only: layouts and pages share one lookup, with no session
// or revocation state cached across requests or users.
export const getSessionUser = cache(async (): Promise<SafeUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSessionToken(token);
});

/** Uncached eligibility check for long-lived connections. */
export async function resolveSessionToken(token: string): Promise<SafeUser | null> {
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  return retryDatabaseRead(async () => {
  if (!(await activeDevice(claims))) return null;
  const user = await findUserById(claims.sub);
  if (!user) return null;
  if (
    user.suspendedAt &&
    (!user.suspendedUntil || user.suspendedUntil.getTime() >= Date.now())
  ) {
    return null;
  }
  // Revocation: a signed millisecond issuance claim avoids JWT `iat`'s
  // second-granularity ambiguity. A copied cookie issued at or before the
  // logout watermark is dead, while an immediate re-login remains valid.
  if (
    user.tokenInvalidBeforeAt &&
    claims.iatMs <= user.tokenInvalidBeforeAt.getTime()
  ) {
    return null;
  }
  const enabledSince = await enabledMfaSince(user.id);
  if (enabledSince && claims.mfaTime < enabledSince.getTime()) return null;
  return toSafeUser(user);
  });
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

/** Authentication age is separate from cookie renewal/issuance. */
export async function getSessionAuthTime(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? (await verifySessionToken(token))?.authTime ?? 0 : 0;
}

export async function getSessionMfaTime(): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? (await verifySessionToken(token))?.mfaTime ?? 0 : 0;
}

export async function getSessionDeviceId(): Promise<string | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? (await verifySessionToken(token))?.sid : undefined;
}
