import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceSessions, users, user2fa } from "@/db/schema";
import { ACCESS_TTL_SECONDS, REFRESH_COOKIE, SESSION_COOKIE, SESSION_TTL_SECONDS, jwtSecret } from "./config";
import { signSessionToken, type SessionClaims } from "./jwt";
import { clientIp, requestIsSecure } from "./http";
import { measureLoginStage } from "./login-performance";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sameHash = (a: string, b: string | null) => Boolean(b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)));
const cookieOptions = (req: NextRequest, maxAge: number) => ({ httpOnly: true, secure: requestIsSecure(req), sameSite: "lax" as const, path: "/", maxAge });
export type DeviceCredentials = { access: string; refresh: string; expiresAt: Date };

export function setDeviceCookies(res: NextResponse, req: NextRequest, credentials: DeviceCredentials) {
  res.cookies.set(SESSION_COOKIE, credentials.access, cookieOptions(req, ACCESS_TTL_SECONDS));
  res.cookies.set(REFRESH_COOKIE, credentials.refresh, cookieOptions(req, Math.max(0, Math.floor((credentials.expiresAt.getTime() - Date.now()) / 1000))));
  res.headers.set("Cache-Control", "no-store");
}

export async function issueDeviceSession(req: NextRequest, user: { id: string; username: string }, mfaTime: number): Promise<DeviceCredentials> {
  const secret = randomBytes(32).toString("base64url");
  const authTime = Date.now();
  const expiresAt = new Date(authTime + SESSION_TTL_SECONDS * 1000);
  // Persist audit, presence and credentials atomically in one round trip.
  // Expired rows are cleaned in bounded maintenance, never by every login.
  const ua = req.headers.get("user-agent");
  const result = await measureLoginStage("session_persist", () => db.execute<{ id: string }>(sql`
    WITH audit AS (
      INSERT INTO login_history (user_id, identifier, success, ip_address, user_agent)
      VALUES (${user.id}, ${user.username}, true, ${clientIp(req)}, ${ua})
    ), presence AS (
      UPDATE users SET last_seen_at=${new Date(authTime)} WHERE id=${user.id}
    )
    INSERT INTO device_sessions (user_id, refresh_hash, user_agent, auth_time, mfa_time, expires_at)
    VALUES (${user.id}, ${digest(secret)}, ${(ua || "Unknown browser").slice(0, 300)}, ${authTime}, ${mfaTime}, ${expiresAt})
    RETURNING id
  `));
  const session = result.rows[0];
  if (!session) throw new Error("device_session_not_created");
  return { access: await measureLoginStage("jwt", () => signSessionToken(user.id, user.username, authTime, mfaTime, session.id)), refresh: `${session.id}.${secret}`, expiresAt };
}

/** Validate device revocation for every access-token request, across instances. */
export async function activeDevice(claims: SessionClaims) {
  if (!claims.sid) {
    // Existing cookies get a finite migration window; renewal never extends it.
    return Date.now() < Date.parse("2026-11-08T00:00:00Z");
  }
  const [session] = await db.select({ id: deviceSessions.id }).from(deviceSessions).where(and(
    eq(deviceSessions.id, claims.sid), eq(deviceSessions.userId, claims.sub), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()),
  ));
  return Boolean(session);
}

/** Serialize rotations; concurrent requests with the previous token converge. */
export async function rotateDeviceSession(token: string): Promise<DeviceCredentials | null> {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, id, secret] = match;
  return db.transaction(async (tx) => {
    const now = new Date();
    const [session] = await tx.select().from(deviceSessions).where(eq(deviceSessions.id, id)).for("update");
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    const [user] = await tx.select().from(users).where(eq(users.id, session.userId));
    const [mfa] = await tx.select().from(user2fa).where(eq(user2fa.userId, session.userId));
    if (!user || (user.suspendedAt && (!user.suspendedUntil || user.suspendedUntil >= now)) ||
      (user.tokenInvalidBeforeAt && session.authTime <= user.tokenInvalidBeforeAt.getTime()) ||
      (mfa?.enabled && session.mfaTime < (mfa.enabledAt ?? mfa.createdAt).getTime())) return null;
    const presented = digest(secret);
    let nextSecret: string;
    if (sameHash(presented, session.refreshHash)) {
      const generation = session.generation + 1;
      nextSecret = createHmac("sha256", jwtSecret()).update(`${id}:${generation}:${secret}`).digest("base64url");
      await tx.update(deviceSessions).set({ refreshHash: digest(nextSecret), previousHash: presented, previousValidUntil: new Date(now.getTime() + 10000), generation, lastSeenAt: now }).where(eq(deviceSessions.id, id));
    } else if (sameHash(presented, session.previousHash) && session.previousValidUntil && session.previousValidUntil > now) {
      nextSecret = createHmac("sha256", jwtSecret()).update(`${id}:${session.generation}:${secret}`).digest("base64url");
    } else {
      // Only a known previous token proves replay. Random guesses must not log out a device.
      if (sameHash(presented, session.previousHash)) await tx.update(deviceSessions).set({ revokedAt: now }).where(eq(deviceSessions.id, id));
      return null;
    }
    return { access: await signSessionToken(user.id, user.username, session.authTime, session.mfaTime, id), refresh: `${id}.${nextSecret}`, expiresAt: session.expiresAt };
  });
}
