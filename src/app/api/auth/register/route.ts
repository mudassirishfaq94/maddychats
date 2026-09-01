import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, registerSchema } from "@/lib/schemas";
import { hashPassword } from "@/server/password";
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
  toSafeUser,
} from "@/server/users";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
  requestIsSecure,
} from "@/server/http";
import { SESSION_COOKIE } from "@/server/config";
import { createSessionToken, sessionCookieOptions } from "@/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(
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
    const code = (err as { code?: string })?.code;
    const constraint = String((err as { constraint?: string })?.constraint ?? "");
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

  const token = await createSessionToken(user.id, user.username);
  const res = NextResponse.json({ user: toSafeUser(user) }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(requestIsSecure(req)));
  return res;
}
