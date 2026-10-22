/**
 * Two-Factor Authentication (TOTP) using Node.js built-in crypto.
 * No external dependencies — uses HMAC-SHA1 per RFC 6238 / RFC 4226.
 */

import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceSessions, mfaChallenges, user2fa, users, type UserRow } from "@/db/schema";
import { accountSuspended } from "./sign-in-state";

const DIGITS = 6;
const PERIOD = 30; // seconds
const ALGORITHM = "sha1";
type SecurityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Authorization and mutation share locks. A request admitted before MFA
 * enrollment, logout or reset cannot change the newer authentication state. */
async function lockMfaActor(tx: SecurityTransaction, userId: string, sessionId: string | undefined) {
  if (!sessionId) return null;
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  if (!user || accountSuspended(user)) return null;
  // All live sessions use the same order as device revocation. Disabling MFA
  // revokes them together; selecting just the actor first could deadlock.
  const sessions = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.userId, userId), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).orderBy(deviceSessions.id).for("update");
  const actor = sessions.find(session => session.id === sessionId);
  if (!actor || actor.approvalRequired || (user.tokenInvalidBeforeAt && actor.authTime <= user.tokenInvalidBeforeAt.getTime())) return null;
  const [factor] = await tx.select().from(user2fa).where(eq(user2fa.userId, userId)).for("update");
  if (factor?.enabled && actor.mfaTime < (factor.enabledAt ?? factor.createdAt).getTime()) return null;
  return { user, factor };
}

/* ──────────── TOTP helpers ──────────── */

/** Convert a base32 secret to a Buffer */
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const val = alphabet.indexOf(ch);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Encode a Buffer to base32 */
function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

/** Generate a random TOTP secret */
function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Generate a TOTP code for a given time step */
export function generateTOTP(secret: string, timeStep: number): string {
  const key = base32Decode(secret);
  const time = Buffer.alloc(8);
  time.writeUInt32BE(0, 0);
  time.writeUInt32BE(timeStep, 4);

  const hmac = createHmac(ALGORITHM, key).update(time).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}


/* ──────────── Public API ──────────── */

/** Generate a new TOTP secret and return setup data */
export async function generateTOTPSetup(userId: string, sessionId: string | undefined) {
  return db.transaction(async tx => {
    const actor = await lockMfaActor(tx, userId, sessionId);
    if (!actor) return { error: "Authentication changed. Sign in again." };
    if (actor.factor?.enabled) return { error: "2FA is already enabled." };
    const secret = generateSecret();
    if (actor.factor) await tx.update(user2fa).set({ secret }).where(and(eq(user2fa.userId, userId), eq(user2fa.enabled, false)));
    else await tx.insert(user2fa).values({ userId, secret, enabled: false });
    const issuer = "Circlo";
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(actor.user.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=${ALGORITHM.toUpperCase()}&digits=${DIGITS}&period=${PERIOD}`;
    return { secret, otpauthUrl };
  });
}

/** Strict code matching, including a bounded clock-drift window. */
export function matchingTOTPStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 1000 / PERIOD);
  for (const step of [current, current - 1, current + 1]) {
    if (step >= 0 && timingSafeEqual(Buffer.from(generateTOTP(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase().replace(/-/g, "")).digest("hex");
}

export function newRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex").match(/.{1,8}/g)!.join("-"));
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export async function verifyAndEnable2FA(userId: string, code: string, sessionId: string | undefined): Promise<
  { success: false; error: string } | { success: true; recoveryCodes: string[]; mfaTime: number; signInUser: UserRow }
> {
  return db.transaction(async tx => {
    const actor = await lockMfaActor(tx, userId, sessionId);
    if (!actor) return { success: false, error: "Authentication changed. Sign in again." };
    const record = actor.factor;
    if (!record || record.enabled) return { success: false, error: "2FA is not pending setup." };
    const step = matchingTOTPStep(record.secret, code);
    if (step === null) return { success: false, error: "Invalid verification code." };
    const recovery = newRecoveryCodes(), enabledAt = new Date();
    await tx.update(user2fa).set({ enabled: true, enabledAt, lastUsedStep: step, recoveryCodeHashes: recovery.hashes }).where(eq(user2fa.userId, userId));
    await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, userId));
    return { success: true, recoveryCodes: recovery.codes, mfaTime: enabledAt.getTime(), signInUser: actor.user };
  });
}

/** Caller holds a transaction; row lock serializes recovery and TOTP consumption. */
export async function consumeSecondFactor(tx: SecurityTransaction, userId: string, code: string): Promise<boolean> {
  const [record] = await tx.select().from(user2fa).where(eq(user2fa.userId, userId)).for("update");
  if (!record?.enabled) return false;
  if (/^[0-9a-f]{8}(?:-?[0-9a-f]{8}){3}$/i.test(code.trim())) {
    const hash = hashRecoveryCode(code);
    const index = record.recoveryCodeHashes.indexOf(hash);
    if (index < 0) return false;
    await tx.update(user2fa).set({ recoveryCodeHashes: record.recoveryCodeHashes.filter((_, i) => i !== index) }).where(eq(user2fa.userId, userId));
    return true;
  }
  const step = matchingTOTPStep(record.secret, code);
  if (step === null || (record.lastUsedStep !== null && step <= record.lastUsedStep)) return false;
  await tx.update(user2fa).set({ lastUsedStep: step }).where(and(eq(user2fa.userId, userId), or(isNull(user2fa.lastUsedStep), lt(user2fa.lastUsedStep, step))));
  return true;
}

export async function verifyTOTPLogin(userId: string, code: string): Promise<{ valid: boolean; error?: string }> {
  const valid = await db.transaction((tx) => consumeSecondFactor(tx, userId, code));
  return { valid, ...(!valid ? { error: "Invalid or already used verification code." } : {}) };
}

export async function replaceRecoveryCodes(userId: string, sessionId: string | undefined) {
  return db.transaction(async tx => {
    const actor = await lockMfaActor(tx, userId, sessionId);
    if (!actor?.factor?.enabled) return null;
    const recovery = newRecoveryCodes();
    await tx.update(user2fa).set({ recoveryCodeHashes: recovery.hashes }).where(eq(user2fa.userId, userId));
    return recovery.codes;
  });
}

/** Check if a user has 2FA enabled */
const enabledFactor = db.select({ enabled: user2fa.enabled }).from(user2fa)
  .where(eq(user2fa.userId, sql.placeholder("userId"))).prepare("");

export async function is2FAEnabled(userId: string): Promise<boolean> {
  const [record] = await enabledFactor.execute({ userId });

  return record?.enabled ?? false;
}

/** Disable 2FA */
export async function disable2FA(
  userId: string,
  sessionId: string | undefined,
): Promise<{ success: boolean; error?: string }> {
  return db.transaction(async tx => {
    const actor = await lockMfaActor(tx, userId, sessionId);
    if (!actor?.factor?.enabled) return { success: false, error: "2FA is not enabled or authentication changed. Sign in again." };
    const now = new Date();
    // Removing the MFA row must not resurrect older cookies whose only
    // revocation was the enabled-at comparison in session authorization.
    await tx.update(users).set({ tokenInvalidBeforeAt: now, updatedAt: now }).where(eq(users.id, userId));
    await tx.update(deviceSessions).set({ revokedAt: now }).where(and(eq(deviceSessions.userId, userId), isNull(deviceSessions.revokedAt)));
    await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, userId));
    await tx.delete(user2fa).where(eq(user2fa.userId, userId));
    return { success: true };
  });
}

/** Also revokes sessions minted before enrollment, including old-format JWTs. */
export async function enabledMfaSince(userId: string): Promise<Date | null> {
  const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, userId));
  return record?.enabled ? record.enabledAt ?? record.createdAt : null;
}
