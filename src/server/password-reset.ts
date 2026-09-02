import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { clientUrl } from "./config";
import { hashPassword } from "./password";
import type { UserRow } from "@/db/schema";

const RESET_TTL_MS = 60 * 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

export function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function issuePasswordReset(user: UserRow): Promise<boolean> {
  const token = randomBytes(32).toString("base64url");
  const resetUrl = `${clientUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  const rows = await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) }).returning({ id: passwordResetTokens.id });
  const name = escapeHtml(user.displayName);
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#111"><div style="padding:40px 16px"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:24px;overflow:hidden"><div style="background:#0b0b0c;color:#fff;padding:28px 32px"><div style="font-size:22px;font-weight:800;letter-spacing:-.5px">Maddy Chats</div><div style="margin-top:6px;color:#b4b4b8;font-size:13px">Simple chat. Real connections.</div></div><div style="padding:34px 32px"><h1 style="font-size:25px;margin:0 0 14px">Reset your password</h1><p style="font-size:15px;line-height:1.65;color:#52525b">Hi ${name}, we received a request to reset your Maddy Chats password.</p><a href="${resetUrl}" style="display:inline-block;margin:18px 0 22px;background:#111;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Choose a new password</a><p style="font-size:13px;line-height:1.6;color:#71717a">This secure link expires in one hour and can only be used once. If you didn’t request this, you can safely ignore this email—your password will remain unchanged.</p><div style="margin-top:26px;padding-top:20px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa">Maddy Chats · Private, simple conversations</div></div></div></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `password-reset-${rows[0].id}` }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [user.email], subject: "Reset your Maddy Chats password", html, text: `Hi ${user.displayName},\n\nReset your Maddy Chats password using this secure link:\n${resetUrl}\n\nThis link expires in one hour and can only be used once. If you didn't request this, ignore this email.` }) });
  if (!response.ok) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, rows[0].id));
    console.error("[maddy-chats] Reset email delivery failed:", response.status);
    return false;
  }
  return true;
}

export async function consumePasswordReset(token: string, password: string): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const consumed = await tx.update(passwordResetTokens).set({ usedAt: now }).where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now))).returning({ userId: passwordResetTokens.userId });
    if (!consumed[0]) return false;
    await tx.update(users).set({ passwordHash: await hashPassword(password), tokenInvalidBeforeAt: now, updatedAt: now }).where(eq(users.id, consumed[0].userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, consumed[0].userId));
    return true;
  });
}
