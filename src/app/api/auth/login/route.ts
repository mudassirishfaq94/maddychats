import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, loginSchema } from "@/lib/schemas";
import { verifyPassword } from "@/server/password";
import { findUserByIdentifier, toSafeUser, touchLastSeen } from "@/server/users";
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

  // Generic error message on both unknown user and wrong password,
  // so the endpoint cannot be used to enumerate accounts.
  const user = await findUserByIdentifier(identifier);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    return jsonError(401, "Incorrect email, username, or password.");
  }

  await touchLastSeen(user.id);

  const token = await createSessionToken(user.id, user.username);
  const res = NextResponse.json({ user: toSafeUser(user) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(requestIsSecure(req)));
  return res;
}
