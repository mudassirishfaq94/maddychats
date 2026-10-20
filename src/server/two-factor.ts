/**
 * Two-Factor Authentication (TOTP) using Node.js built-in crypto.
 * No external dependencies — uses HMAC-SHA1 per RFC 6238 / RFC 4226.
 */

import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { user2fa, users } from "@/db/schema";

const DIGITS = 6;
const PERIOD = 30; // seconds
const ALGORITHM = "sha1";

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
export async function generateTOTPSetup(userId: string) {
  // Check if already set up
  const [existing] = await db
    .select()
    .from(user2fa)
    .where(eq(user2fa.userId, userId));

  let secret: string;
  if (existing && !existing.enabled) {
    // Re-generate for a pending setup
    secret = generateSecret();
    await db
      .update(user2fa)
      .set({ secret })
      .where(eq(user2fa.userId, userId));
  } else if (existing?.enabled) {
    return { error: "2FA is already enabled." };
  } else {
    secret = generateSecret();
    await db.insert(user2fa).values({ userId, secret, enabled: false });
  }

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));

  const issuer = "Circlo";
  const accountName = user?.email ?? userId;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=${ALGORITHM.toUpperCase()}&digits=${DIGITS}&period=${PERIOD}`;

  return { secret, otpauthUrl };
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

export async function verifyAndEnable2FA(userId: string, code: string): Promise<{ success: boolean; error?: string; recoveryCodes?: string[]; mfaTime?: number }> {
  const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, userId));
  if (!record || record.enabled) return { success: false, error: "2FA is not pending setup." };
  const step = matchingTOTPStep(record.secret, code);
  if (step === null) return { success: false, error: "Invalid verification code." };
  const recovery = newRecoveryCodes();
  const enabledAt = new Date();
  const enabled = await db.update(user2fa).set({ enabled: true, enabledAt, lastUsedStep: step, recoveryCodeHashes: recovery.hashes })
    .where(and(eq(user2fa.userId, userId), eq(user2fa.secret, record.secret), eq(user2fa.enabled, false)))
    .returning({ userId: user2fa.userId });
  return enabled.length ? { success: true, recoveryCodes: recovery.codes, mfaTime: enabledAt.getTime() } : { success: false, error: "Setup changed. Please start again." };
}

type SecurityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export async function replaceRecoveryCodes(userId: string) {
  const recovery = newRecoveryCodes();
  const rows = await db.update(user2fa).set({ recoveryCodeHashes: recovery.hashes })
    .where(and(eq(user2fa.userId, userId), eq(user2fa.enabled, true))).returning({ userId: user2fa.userId });
  return rows.length ? recovery.codes : null;
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
): Promise<{ success: boolean; error?: string }> {
  const [record] = await db
    .select()
    .from(user2fa)
    .where(eq(user2fa.userId, userId));

  if (!record?.enabled) {
    return { success: false, error: "2FA is not enabled." };
  }

  await db.delete(user2fa).where(eq(user2fa.userId, userId));
  return { success: true };
}

/** Also revokes sessions minted before enrollment, including old-format JWTs. */
export async function enabledMfaSince(userId: string): Promise<Date | null> {
  const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, userId));
  return record?.enabled ? record.enabledAt ?? record.createdAt : null;
}
