import { withPasswordCapacity } from "@/server/password-capacity";
import { issueEmailVerification } from "@/server/email-verification";
import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, registerSchema } from "@/lib/schemas";
import { hashPassword } from "@/server/password";
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
} from "@/server/users";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";

export const dynamic = "force-dynamic";

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
    return jsonError(409, "This username is taken.", {
      username: "This username is taken",
    });
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await createUser({ displayName, username, email, passwordHash });
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
      return jsonError(409, "This username is taken.", {
        username: "This username is taken",
      });
    }
    console.error("[maddy-chats] register error:", err);
    return jsonError(500, "Something went wrong. Please try again.");
  }

  const delivered = await issueEmailVerification(user);
  return NextResponse.json({ verificationRequired: true, emailSent: delivered }, { status: 201 });
}

export const POST = withPasswordCapacity(handlePOST);
