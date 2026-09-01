import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/config";
import {
  createSessionToken,
  getSessionUserWithPresence,
  sessionCookieOptions,
} from "@/server/session";
import { jsonError, requestIsSecure } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUserWithPresence();
  if (!user) {
    return jsonError(401, "Not authenticated.");
  }
  // Rolling persistence: every successful session check renews the signed
  // cookie. Browser/app restarts therefore keep the user logged in, while
  // explicit logout still revokes all previously issued tokens server-side.
  const token = await createSessionToken(user.id, user.username);
  const response = NextResponse.json({ user });
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(requestIsSecure(req)),
  );
  return response;
}
