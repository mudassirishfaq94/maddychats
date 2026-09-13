import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailVerificationTokens, users, type UserRow } from "@/db/schema";
import { clientUrl } from "./config";

const TTL_MS = 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function sender() {
  const name = process.env.EMAIL_FROM_NAME?.trim() || "Circlo";
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  return address ? `${name} <${address}>` : process.env.EMAIL_FROM;
}

export async function issueEmailVerification(user: UserRow): Promise<boolean> {
  const from = sender();
  if (!process.env.RESEND_API_KEY || !from) return false;
  const token = randomBytes(32).toString("base64url");
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
  await db.insert(emailVerificationTokens).values({ userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MS) });
  const url = `${clientUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f6;font-family:Arial,sans-serif;color:#18332c"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden"><div style="background:#148d68;color:#fff;padding:28px 32px;font-size:24px;font-weight:800">Circlo</div><div style="padding:32px"><h1 style="margin:0 0 14px">Welcome to Circlo 👋</h1><p>Thanks for creating your Circlo account. Confirm your email address to activate it.</p><p style="margin:28px 0"><a href="${url}" style="background:#148d68;color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:bold">Verify My Email</a></p><p style="font-size:13px;color:#5b6d67">This link expires in 24 hours and can be used once. If you did not create a Circlo account, you can ignore this email.</p></div><div style="padding:18px 32px;background:#eef5f2;font-size:12px;color:#5b6d67">© Circlo · Your people, your conversations.</div></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [user.email], ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}), subject: "Verify your Circlo email", html, text: `Welcome to Circlo. Verify your email: ${url}\nThis link expires in 24 hours.` }) });
  return response.ok;
}

export async function consumeEmailVerification(token: string): Promise<"verified" | "invalid"> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx.update(emailVerificationTokens).set({ usedAt: now }).where(and(eq(emailVerificationTokens.tokenHash, hash(token)), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, now))).returning({ userId: emailVerificationTokens.userId });
    if (!rows[0]) return "invalid";
    await tx.update(users).set({ updatedAt: now }).where(eq(users.id, rows[0].userId));
    return "verified";
  });
}
