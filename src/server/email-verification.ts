import { createHash, createHmac, randomInt } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailVerificationTokens, users, type UserRow } from "@/db/schema";
import { clientUrl, jwtSecret } from "./config";
import { verificationEmail } from "./verification-email-template";
import { rateLimit } from "./rate-limit";
import { safeError } from "./safe-error";

const TTL_MS = 10 * 60 * 1000;
const codeHash = (userId: string, code: string) => createHmac("sha256", jwtSecret()).update(`email-verification:${userId}:${code}`).digest("hex");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function sender() {
  const name = process.env.EMAIL_FROM_NAME?.trim() || "Circlo";
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  return address ? `${name} <${address}>` : process.env.EMAIL_FROM;
}

export function verificationDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && sender());
}

export async function issueEmailVerification(user: UserRow): Promise<boolean> {
  if (user.emailVerifiedAt || user.email.endsWith("@auth.maddychats.invalid")) return false;
  const from = sender();
  if (!process.env.RESEND_API_KEY || !from) return false;
  try {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const tokenHash = codeHash(user.id, code);
    const issued = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`verify-email:${user.id}`},0))`);
      const [recent] = await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId,user.id)).orderBy(sql`${emailVerificationTokens.createdAt} desc`).limit(1);
      if (recent && Date.now() - recent.createdAt.getTime() < 60_000) return false;
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId,user.id));
      await tx.insert(emailVerificationTokens).values({userId:user.id,tokenHash,expiresAt:new Date(Date.now()+TTL_MS)});
      return true;
    });
    if (!issued) return false;
    const template = verificationEmail(code, clientUrl());
    const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [user.email], ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}), subject: "Your Circlo verification code", ...template }) });
    // A rejected provider request is not successful delivery. Retain the short
    // cooldown even on failure, preventing provider-error retry floods.
    return response.ok;
  } catch (error) {
    console.error("[circlo] email verification unavailable", safeError(error));
    return false;
  }
}

export async function consumeEmailVerification(token: string): Promise<"verified" | "invalid"> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx.update(emailVerificationTokens).set({ usedAt: now }).where(and(eq(emailVerificationTokens.tokenHash, hash(token)), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, now))).returning({ userId: emailVerificationTokens.userId });
    if (!rows[0]) return "invalid";
    await tx.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, rows[0].userId));
    return "verified";
  });
}

/** Account and IP limits are independent; codes are HMAC-bound to one user. */
export async function consumeEmailVerificationCode(email: string, code: string): Promise<"verified" | "invalid" | "expired" | "limited"> {
  const bucket = createHmac("sha256", jwtSecret()).update(email).digest("hex");
  if (!(await rateLimit(`verify-code:${bucket}`, 5, 10 * 60 * 1000)).allowed) return "limited";
  return db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.email,email)).limit(1);
    if (!user) return "invalid";
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`verify-email:${user.id}`},0))`);
    const [row] = await tx.select().from(emailVerificationTokens).where(and(eq(emailVerificationTokens.userId,user.id),eq(emailVerificationTokens.tokenHash,codeHash(user.id,code)),isNull(emailVerificationTokens.usedAt))).limit(1);
    if (!row) return "invalid";
    if (row.expiresAt.getTime() <= Date.now()) return "expired";
    const now = new Date();
    await tx.update(emailVerificationTokens).set({usedAt:now}).where(eq(emailVerificationTokens.id,row.id));
    await tx.update(users).set({emailVerifiedAt:now,updatedAt:now}).where(eq(users.id,user.id));
    return "verified";
  });
}
