import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, profileUpdateSchema } from "@/lib/schemas";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
  requestIsSecure,
} from "@/server/http";
import {
  getSessionUser,
  createSessionToken,
  sessionCookieOptions,
} from "@/server/session";
import {
  findUserByUsername,
  toSafeUser,
  updateUserProfile,
} from "@/server/users";
import { SESSION_COOKIE } from "@/server/config";

export const dynamic = "force-dynamic";

/** Own profile — the complete safe shape (includes private email). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  return NextResponse.json({ user });
}

/**
 * Edit own profile (display name, username, bio). Email changes are not part
 * of V1. Username changes re-verify uniqueness and re-issue the session
 * cookie so its display snapshot stays accurate.
 */
export async function PATCH(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `profile:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const input = parsed.data;

  // Username uniqueness — case-insensitive, excluding the current value.
  let usernameChanged = false;
  if (input.username !== undefined) {
    const next = input.username.trim();
    if (next.toLowerCase() !== me.username.toLowerCase()) {
      const taken = await findUserByUsername(next);
      if (taken && taken.id !== me.id) {
        return jsonError(409, "This username is taken.", {
          username: "This username is taken",
        });
      }
      usernameChanged = true;
    }
  }

  let updated;
  try {
    updated = await updateUserProfile(me.id, input);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const constraint = String(
      (err as { constraint?: string })?.constraint ?? "",
    );
    if (code === "23505" || constraint.includes("username")) {
      return jsonError(409, "This username is taken.", {
        username: "This username is taken",
      });
    }
    console.error("[maddy-chats] profile update error:", err);
    return jsonError(500, "Something went wrong. Please try again.");
  }

  const safe = toSafeUser(updated);
  const res = NextResponse.json({ user: safe });

  if (usernameChanged) {
    const token = await createSessionToken(safe.id, safe.username);
    res.cookies.set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(requestIsSecure(req)),
    );
  }
  return res;
}
