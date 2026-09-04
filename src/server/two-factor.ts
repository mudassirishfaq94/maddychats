/**
 * Two-Factor Authentication (TOTP) using Node.js built-in crypto.
 * No external dependencies — uses HMAC-SHA1 per RFC 6238 / RFC 4226.
 */

import { createHmac, createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
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
function generateTOTP(secret: string, timeStep: number): string {
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

/** Get current time step */
function getCurrentTimeStep(): number {
  return Math.floor(Date.now() / 1000 / PERIOD);
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

  const issuer = "Maddy Chats";
  const accountName = user?.email ?? userId;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=${ALGORITHM.toUpperCase()}&digits=${DIGITS}&period=${PERIOD}`;

  return { secret, otpauthUrl };
}

/** Verify a TOTP code and enable 2FA if pending */
export async function verifyAndEnable2FA(
  userId: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const [record] = await db
    .select()
    .from(user2fa)
    .where(eq(user2fa.userId, userId));

  if (!record) return { success: false, error: "2FA not set up." };
  if (record.enabled) return { success: false, error: "2FA is already enabled." };

  // Check current time step and one step before/after for clock drift
  const currentStep = getCurrentTimeStep();
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (generateTOTP(record.secret, step) === code) {
      await db
        .update(user2fa)
        .set({ enabled: true, enabledAt: new Date() })
        .where(eq(user2fa.userId, userId));
      return { success: true };
    }
  }

  return { success: false, error: "Invalid verification code. Please try again." };
}

/** Verify a TOTP code during login */
export async function verifyTOTPLogin(
  userId: string,
  code: string,
): Promise<{ valid: boolean; error?: string }> {
  const [record] = await db
    .select()
    .from(user2fa)
    .where(eq(user2fa.userId, userId));

  if (!record || !record.enabled) {
    return { valid: true }; // No 2FA = pass through
  }

  const currentStep = getCurrentTimeStep();
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (generateTOTP(record.secret, step) === code) {
      return { valid: true };
    }
  }

  return { valid: false, error: "Invalid verification code." };
}

/** Check if a user has 2FA enabled */
export async function is2FAEnabled(userId: string): Promise<boolean> {
  const [record] = await db
    .select({ enabled: user2fa.enabled })
    .from(user2fa)
    .where(eq(user2fa.userId, userId));

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
