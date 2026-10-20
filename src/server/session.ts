import { cache } from "react";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  ACCESS_TTL_SECONDS,
  cookieSecure,
} from "./config";
import { signSessionToken, verifySessionToken } from "./jwt";
import { toSafeUser, touchLastSeen } from "./users";
import { is2FAEnabled } from "./two-factor";
import type { UserRow } from "@/db/schema";
import type { SafeUser } from "@/lib/types";
import { db } from "@/db";
import { users, user2fa, deviceSessions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { retryDatabaseRead } from "./database-read-retry";

// Compile the query once, but execute against fresh state for every request.
// An empty name avoids named prepared-statement requirements on DB poolers.
const sessionQuery = db.select({ user: users, mfa: user2fa,
  approvalRequired: sql<boolean>`coalesce((select approval_required from ${deviceSessions}
    where ${deviceSessions.id}=${sql.placeholder("sid")}::uuid
      and ${deviceSessions.userId}=${sql.placeholder("userId")}::uuid), false)`,
  deviceActive: sql<boolean>`case when ${sql.placeholder("sid")}::uuid is null
    then ${sql.placeholder("legacy")}::boolean else exists(select 1 from ${deviceSessions}
    where ${deviceSessions.id}=${sql.placeholder("sid")}::uuid
      and ${deviceSessions.userId}=${sql.placeholder("userId")}::uuid
      and ${deviceSessions.revokedAt} is null
      and ${deviceSessions.expiresAt}>${sql.placeholder("now")}::timestamptz) end`,
}).from(users).leftJoin(user2fa, eq(user2fa.userId, users.id))
  .where(eq(users.id, sql.placeholder("userId"))).limit(1).prepare("");

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
  devicePending = false,
): Promise<string> {
  return signSessionToken(userId, username, authTime, mfaTime, sid, devicePending);
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
export const getSessionAccess = cache(async (): Promise<{user: SafeUser; approvalRequired: boolean} | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSessionAccess(token);
});

/** Normal application authorization never accepts a restricted sign-in. */
export const getSessionUser = cache(async (): Promise<SafeUser | null> => {
  const access = await getSessionAccess();
  return access && !access.approvalRequired ? access.user : null;
});

/** Only the explicit device-setup allowlist may use this primary-auth identity. */
export const getDeviceSetupUser = cache(async (): Promise<SafeUser | null> => {
  const access = await getSessionAccess();
  if (!access) return null;
  return deviceSetupIdentity(access);
});

export function deviceSetupIdentity(access: { user: SafeUser; approvalRequired: boolean }): SafeUser {
  if (!access.approvalRequired) return access.user;
  // Setup needs the verified owner identity, not their editable profile or role.
  return { ...access.user, avatarUrl: null, bio: null, role: "user", lastSeenAt: null, deviceName: null, country: null };
}

/** Uncached eligibility check for long-lived connections. */
export async function resolveSessionToken(token: string): Promise<SafeUser | null> {
  const access = await resolveSessionAccess(token);
  return access && !access.approvalRequired ? access.user : null;
}

export async function resolveSessionAccess(token: string): Promise<{user: SafeUser; approvalRequired: boolean} | null> {
  const claims = await verifySessionToken(token);
  // Old sessionless cookies cannot carry server-enforced device approval.
  // Sign in again; browser encryption keys and their trust are retained.
  if (!claims?.sid) return null;
  return retryDatabaseRead(async () => {
  // One fresh database snapshot checks all three conditions. No cross-request
  // cache: logout, suspension, device revocation and MFA remain immediate.
  const [record] = await sessionQuery.execute({ userId: claims.sub, sid: claims.sid ?? null,
    legacy: false, now: new Date(),
  });
  const user = record?.user;
  if (record?.approvalRequired && Date.now() - claims.authTime >= 15 * 60_000) return null;
  const deviceActive = record?.deviceActive;
  const enabledSince = record?.mfa?.enabled ? record.mfa.enabledAt ?? record.mfa.createdAt : null;
  if (!deviceActive) return null;
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
  if (enabledSince && claims.mfaTime < enabledSince.getTime()) return null;
  return { user: toSafeUser(user), approvalRequired: record.approvalRequired };
  });
}

/**
 * Like getSessionUser but also refreshes `lastSeenAt` when it is stale
 * (at most one write per minute per user).
 */
export async function getSessionUserWithPresence(): Promise<SafeUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return touchSessionPresence(user);
}

export async function touchSessionPresence(user: SafeUser): Promise<SafeUser> {
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
