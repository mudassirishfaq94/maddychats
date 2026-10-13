import { createHmac, randomInt } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceRecoveryEmailCodes } from "@/db/schema";
import { clientUrl, jwtSecret } from "@/server/config";
import { deviceRecoveryEmail } from "@/server/device-recovery-email-template";

const CODE_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;

const hashCode = (userId: string, deviceId: string, sessionId: string, fingerprint: string, code: string) =>
  createHmac("sha256", jwtSecret())
    .update(`device-recovery-email:v1:${userId}:${deviceId}:${sessionId}:${fingerprint}:${code}`)
    .digest("hex");

function sender() {
  const name = process.env.EMAIL_FROM_NAME?.trim() || "Circlo";
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  return address ? `${name} <${address}>` : process.env.EMAIL_FROM;
}

export function deviceRecoveryEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && sender());
}

export async function issueDeviceRecoveryEmailCode(input: {
  user: { id: string; email: string; emailVerifiedAt: Date | null };
  deviceId: string;
  sessionId: string;
  fingerprint: string;
}): Promise<"sent" | "cooldown" | "failed"> {
  const { user, deviceId, sessionId, fingerprint } = input;
  if (!user.emailVerifiedAt || user.email.endsWith("@auth.maddychats.invalid")) return "failed";
  const from = sender();
  const apiKey = process.env.RESEND_API_KEY;
  if (!from || !apiKey) return "failed";

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const tokenHash = hashCode(user.id, deviceId, sessionId, fingerprint, code);
  const createdAt = new Date();
  const inserted = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`device-recovery-email:${user.id}`},0))`);
    const [recent] = await tx.select({ createdAt: deviceRecoveryEmailCodes.createdAt })
      .from(deviceRecoveryEmailCodes)
      .where(eq(deviceRecoveryEmailCodes.userId, user.id))
      .orderBy(deviceRecoveryEmailCodes.createdAt)
      .limit(1);
    if (recent && createdAt.getTime() - recent.createdAt.getTime() < SEND_COOLDOWN_MS) return null;
    await tx.delete(deviceRecoveryEmailCodes).where(eq(deviceRecoveryEmailCodes.userId, user.id));
    const [row] = await tx.insert(deviceRecoveryEmailCodes).values({
      userId: user.id,
      deviceId,
      sessionId,
      fingerprint,
      codeHash: tokenHash,
      expiresAt: new Date(createdAt.getTime() + CODE_TTL_MS),
      createdAt,
    }).returning({ id: deviceRecoveryEmailCodes.id });
    return row;
  });
  if (!inserted) return "cooldown";

  try {
    const template = deviceRecoveryEmail(code, clientUrl());
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `device-recovery-${inserted.id}` },
      body: JSON.stringify({ from, to: [user.email], ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}), subject: "Your Circlo device recovery code", ...template }),
    });
    if (response.ok) return "sent";
    console.error("[circlo] device recovery email rejected", { status: response.status });
  } catch {
    console.error("[circlo] device recovery email unavailable");
  }
  // Keep the short cooldown even when the provider fails, avoiding resend floods.
  return "failed";
}

export async function consumeDeviceRecoveryEmailCode(input: {
  userId: string;
  deviceId: string;
  sessionId: string;
  fingerprint: string;
  code: string;
}): Promise<boolean> {
  const { userId, deviceId, sessionId, fingerprint, code } = input;
  if (!/^\d{6}$/.test(code)) return false;
  const now = new Date();
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`device-recovery-email:${userId}`},0))`);
    const [row] = await tx.select({ id: deviceRecoveryEmailCodes.id })
      .from(deviceRecoveryEmailCodes)
      .where(and(
        eq(deviceRecoveryEmailCodes.userId, userId),
        eq(deviceRecoveryEmailCodes.deviceId, deviceId),
        eq(deviceRecoveryEmailCodes.sessionId, sessionId),
        eq(deviceRecoveryEmailCodes.fingerprint, fingerprint),
        eq(deviceRecoveryEmailCodes.codeHash, hashCode(userId, deviceId, sessionId, fingerprint, code)),
        isNull(deviceRecoveryEmailCodes.usedAt),
        gt(deviceRecoveryEmailCodes.expiresAt, now),
      ))
      .for("update")
      .limit(1);
    if (!row) return false;
    const consumed = await tx.update(deviceRecoveryEmailCodes)
      .set({ usedAt: now })
      .where(and(eq(deviceRecoveryEmailCodes.id, row.id), isNull(deviceRecoveryEmailCodes.usedAt)))
      .returning({ id: deviceRecoveryEmailCodes.id });
    return consumed.length === 1;
  });
}
