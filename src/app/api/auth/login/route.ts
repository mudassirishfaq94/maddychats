import { issueEmailVerification, verificationDeliveryConfigured } from "@/server/email-verification";
import { readGoogleEmailProof, GOOGLE_EMAIL_PROOF_COOKIE, GOOGLE_EMAIL_PROOF_TTL } from "@/server/google-email-proof";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { beginSignIn } from "@/server/authentication";
import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, loginSchema } from "@/lib/schemas";
import { verifyPassword } from "@/server/password";
import { findUserByIdentifier } from "@/server/users";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";
import { newSessionBlockReason } from "@/server/session";
import { recordLoginAttempt } from "@/server/privacy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = await rateLimit(
    `login:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const { identifier, password } = parsed.data;
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || undefined;

  // Generic error message on both unknown user and wrong password,
  // so the endpoint cannot be used to enumerate accounts.
  const user = await findUserByIdentifier(identifier);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    // Record failed attempt
    await recordLoginAttempt({
      userId: user?.id,
      identifier,
      success: false,
      ipAddress: ip,
      userAgent: ua,
    });
    return jsonError(401, "Incorrect email, username, or password.");
  }

  const sessionBlock = await newSessionBlockReason(user);
  if (sessionBlock === "suspended") {
    return jsonError(403, "This account is unavailable.");
  }
  if (!user.emailVerifiedAt) {
    const proof = process.env.STARTER_MODE === "1"
      ? await readGoogleEmailProof(req.cookies.get(GOOGLE_EMAIL_PROOF_COOKIE)?.value, user.id, user.email)
      : null;
    if (!proof || !(await rateLimit(`google-email-proof:${proof}`, 1, GOOGLE_EMAIL_PROOF_TTL * 1000)).allowed) {
      if (verificationDeliveryConfigured()) await issueEmailVerification(user);
      return NextResponse.json({ error: process.env.STARTER_MODE === "1" && !verificationDeliveryConfigured()
        ? "Verify your email using Google, then enter your existing password."
        : "Verify your email before signing in.", verificationRequired: true }, { status: 403 });
    }
    user.emailVerifiedAt = new Date();
    await db.update(users).set({ emailVerifiedAt: user.emailVerifiedAt }).where(eq(users.id, user.id));
  }

  const response = await beginSignIn(req, user);
  response.cookies.set(GOOGLE_EMAIL_PROOF_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/auth/login", maxAge: 0 });
  return response;
}
