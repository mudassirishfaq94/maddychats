import { rateLimit } from "./rate-limit";
import { createHash, randomBytes } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mfaChallenges, users, user2fa, type UserRow } from "@/db/schema";
import { SESSION_COOKIE, REFRESH_COOKIE, clientUrl } from "./config";
import { sameOriginDestination } from "../lib/navigation";
import { jsonError, requestIsSecure } from "./http";
import { getSessionAuthTime, newSessionBlockReason, sessionCookieOptions } from "./session";
import { issueDeviceSession, setDeviceCookies } from "./device-sessions";
import { consumeSecondFactor, is2FAEnabled, verifyTOTPLogin } from "./two-factor";
import { findUserById, toSafeUser } from "./users";
import { verifyPassword } from "./password";

export const MFA_COOKIE = "maddy_mfa_challenge";
const CHALLENGE_MS = 5 * 60 * 1000;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function recentlyAuthenticated(authTime: number, now = Date.now()) {
  return authTime > 0 && authTime <= now && now - authTime < CHALLENGE_MS;
}

export async function setAuthenticatedSession(response: NextResponse, req: NextRequest, user: Pick<UserRow, "id" | "username">, mfaTime = 0) {
  setDeviceCookies(response, req, await issueDeviceSession(req, user, mfaTime));
  response.cookies.set(MFA_COOKIE, "", { ...sessionCookieOptions(requestIsSecure(req)), maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Only called after a primary credential has been verified. */
export async function beginSignIn(req: NextRequest, user: UserRow, redirectTo?: string) {
  // Reverse proxies expose an internal req.url; redirect browsers to the public origin.
  const destination = redirectTo ? new URL(sameOriginDestination(redirectTo, clientUrl())) : undefined;
  const returnPath = destination ? destination.pathname + destination.search + destination.hash : undefined;
  const blocked = await newSessionBlockReason(user);
  if (blocked === "suspended") return jsonError(403, "This account is unavailable.");
  if (blocked === "mfa_required") {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await db.insert(mfaChallenges).values({ tokenHash: digest(token), userId: user.id, expiresAt: new Date(now.getTime() + CHALLENGE_MS) });
    const response = redirectTo
      ? NextResponse.redirect(new URL(`/login?mfa=1&next=${encodeURIComponent(returnPath!)}`, clientUrl()))
      : NextResponse.json({ mfaRequired: true });
    response.cookies.set(MFA_COOKIE, token, { ...sessionCookieOptions(requestIsSecure(req)), maxAge: CHALLENGE_MS / 1000 });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(requestIsSecure(req)), maxAge: 0 });
    response.cookies.set(REFRESH_COOKIE, "", { ...sessionCookieOptions(requestIsSecure(req)), maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = destination ? NextResponse.redirect(destination) : NextResponse.json({ user: toSafeUser(user) });
  return setAuthenticatedSession(response, req, user);
}

/** Consume challenge and factor in the same transaction; both are single-use. */
export async function completeMfaChallenge(token: string, code: string): Promise<(UserRow & { mfaTime: number }) | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [pending] = await db.select({ userId: mfaChallenges.userId }).from(mfaChallenges).where(eq(mfaChallenges.tokenHash, digest(token)));
  if (!pending || !(await rateLimit(`mfa-user:${pending.userId}`, 10, 10 * 60 * 1000)).allowed) return null;
  return db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(mfaChallenges)
      .where(and(eq(mfaChallenges.tokenHash, digest(token)), gt(mfaChallenges.expiresAt, new Date()))).for("update");
    if (!challenge) return null;
    const [user] = await tx.select().from(users).where(eq(users.id, challenge.userId)).for("update");
    if (!user || (user.suspendedAt && (!user.suspendedUntil || user.suspendedUntil.getTime() >= Date.now())) ||
      (user.tokenInvalidBeforeAt && challenge.createdAt <= user.tokenInvalidBeforeAt)) return null;
    const [factor] = await tx.select().from(user2fa).where(eq(user2fa.userId, user.id)).for("update");
    if (!factor?.enabled || !(await consumeSecondFactor(tx, user.id, code))) return null;
    await tx.delete(mfaChallenges).where(eq(mfaChallenges.tokenHash, challenge.tokenHash));
    return { ...user, mfaTime: (factor.enabledAt ?? factor.createdAt).getTime() };
  });
}

/** Existing cookie alone cannot authorize a sensitive action indefinitely. */
export async function verifyFreshAuthentication(userId: string, body: Record<string, unknown> | null) {
  if (recentlyAuthenticated(await getSessionAuthTime())) return true;
  const password = body?.password;
  if (typeof password !== "string" || !password || password.length > 72) return false;
  const user = await findUserById(userId);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return false;
  if (await is2FAEnabled(userId)) {
    return typeof body?.mfaCode === "string" && (await verifyTOTPLogin(userId, body.mfaCode.trim())).valid;
  }
  return true;
}
