import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, forgotPasswordSchema } from "@/lib/schemas";
import { findUserByEmail } from "@/server/users";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { clientIp, guardSameOrigin, jsonError, readJson } from "@/server/http";
import { emailDeliveryConfigured, issuePasswordReset } from "@/server/password-reset";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `forgot:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (!emailDeliveryConfigured()) return jsonError(503, "Password-reset email delivery is temporarily unavailable.");
  const user = await findUserByEmail(email);
  if (user) await issuePasswordReset(user);
  // Always return the same response so account existence is never disclosed.
  return NextResponse.json({ ok: true, delivered: true });
}
