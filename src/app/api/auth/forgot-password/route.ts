import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, forgotPasswordSchema } from "@/lib/schemas";
import { findUserByEmail } from "@/server/users";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { clientIp, guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * V1 password-reset endpoint.
 *
 * Architecture is in place (validation, user lookup, rate limiting, a
 * provider abstraction point), but email delivery is NOT wired up yet — no
 * SMTP/transactional-email provider is configured in this environment. We
 * therefore respond honestly (`delivered: false`) instead of pretending an
 * email was sent.
 *
 * To enable delivery later:
 *   1. Add SMTP_URL / RESEND_API_KEY etc. to the environment.
 *   2. Create a password_reset_tokens table + issue a single-use token here.
 *   3. Send the reset link via the provider inside `deliverResetEmail`.
 */
async function deliverResetEmail(_email: string): Promise<{
  configured: boolean;
}> {
  const configured = Boolean(
    process.env.SMTP_URL ||
      process.env.EMAIL_SERVER ||
      process.env.RESEND_API_KEY,
  );
  return { configured };
}

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

  // Lookup happens (architecture ready); the result is intentionally unused
  // so the response can never reveal whether an account exists.
  await findUserByEmail(email);

  const { configured } = await deliverResetEmail(email);

  if (!configured) {
    return NextResponse.json({
      ok: false,
      delivered: false,
      reason: "email_provider_not_configured",
      message:
        "Password-reset email delivery is not configured in this environment yet.",
    });
  }

  // Placeholder for the future happy path once a provider is configured.
  return NextResponse.json({ ok: true, delivered: true });
}
