import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { deviceSessions, mfaChallenges, passwordResetTokens, users } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { resetPasswordSchema, fieldErrors } from "@/lib/schemas";
import { hashPassword, verifyPassword } from "@/server/password";
import { is2FAEnabled, verifyTOTPLogin } from "@/server/two-factor";
import { rateLimit } from "@/server/rate-limit";
import { withPasswordCapacity } from "@/server/password-capacity";

async function changePassword(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Sign in before changing your password.");
  const limit = await rateLimit(`password-change:${user.id}`, 5, 10 * 60 * 1000);
  if (!limit.allowed) return jsonError(429, "Too many password-change attempts. Wait before retrying.");
  const body = await readJson(req);
  const parsed = resetPasswordSchema.safeParse({ ...body, token: "profile-password-change-validation-only" });
  if (!parsed.success) return jsonError(422, "Check your new password.", fieldErrors(parsed.error));
  if (typeof body?.currentPassword !== "string" || !body.currentPassword || new TextEncoder().encode(body.currentPassword).length > 72) return jsonError(422, "Enter your current Circlo password.", { currentPassword: "Current password is required" });
  const [account] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!account || !await verifyPassword(body.currentPassword, account.passwordHash)) return jsonError(403, "Your current password is incorrect. Try again or use Forgot password.", { currentPassword: "Incorrect current password" });
  if (await is2FAEnabled(user.id)) {
    if (typeof body.mfaCode !== "string" || body.mfaCode.length > 40 || !(await verifyTOTPLogin(user.id, body.mfaCode)).valid) return jsonError(403, "Use a fresh authenticator code (wait for it to change), or an unused recovery code.");
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const changed = await db.transaction(async tx => {
    const [current] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).for("update");
    if (!current || current.passwordHash !== account.passwordHash) return false;
    const now = new Date();
    await tx.update(users).set({ passwordHash, updatedAt: now, tokenInvalidBeforeAt: now }).where(eq(users.id, user.id));
    await tx.update(deviceSessions).set({ revokedAt: now }).where(and(eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt)));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    await tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, user.id));
    return true;
  });
  if (!changed) return jsonError(409, "Your password changed elsewhere. Sign in again before retrying.");
  return NextResponse.json({ ok: true, signInRequired: true }, { headers: { "Cache-Control": "private, no-store" } });
}
export const POST = withPasswordCapacity(changePassword);
