import { guardAuthChallenge } from "@/server/auth-challenge";
import { safeError } from "@/server/safe-error";
import { withPasswordCapacity } from "@/server/password-capacity";
import { issueEmailVerification } from "@/server/email-verification";
import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, registerSchema } from "@/lib/schemas";
import { hashPassword } from "@/server/password";
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
  availableUsernameSuggestions,
} from "@/server/users";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { policyAcceptance } from "@/lib/policy-consent";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";

export const dynamic = "force-dynamic";

async function usernameTaken(username: string) {
  return NextResponse.json({ error: "This username is taken. Choose another or try a suggestion.", fields: { username: "This username is taken" }, suggestions: await availableUsernameSuggestions(username) }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
}

async function handlePOST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = await rateLimit(
    `register:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const body = await readJson(req);
  const challengeError = await guardAuthChallenge(body, "register");
  if (challengeError) return challengeError;
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const { displayName, username, email, password } = parsed.data;

  if (await findUserByEmail(email)) {
    return jsonError(409, "An account with this email already exists.", {
      email: "This email is already registered",
    });
  }
  if (await findUserByUsername(username)) {
    return usernameTaken(username);
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await createUser({ displayName, username, email, passwordHash, ...policyAcceptance(parsed.data)! });
  } catch (err) {
    // Unique-constraint race safety net (concurrent registrations).
    const failure = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    const code = failure.code ?? failure.cause?.code;
    const constraint = String(failure.constraint ?? failure.cause?.constraint ?? "");
    if (code === "23505") {
      if (constraint.includes("email")) {
        return jsonError(409, "An account with this email already exists.", {
          email: "This email is already registered",
        });
      }
      return usernameTaken(username);
    }
    console.error("[maddy-chats] register error:", safeError(err));
    return jsonError(500, "Something went wrong. Please try again.");
  }

  const delivered = await issueEmailVerification(user);
  return NextResponse.json({ verificationRequired: true, emailSent: delivered }, { status: 201 });
}

export const POST = withPasswordCapacity(handlePOST);
