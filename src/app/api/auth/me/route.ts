import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/config";
import {
  createSessionToken,
  getSessionAuthTime,
  getSessionMfaTime,
  getSessionDeviceId,
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
  const response = NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
  // Renewal preserves primary/MFA authentication times and cannot satisfy a
  // fresh-authentication requirement on its own.
  const token = await createSessionToken(user.id, user.username, await getSessionAuthTime(), await getSessionMfaTime(), await getSessionDeviceId());
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(requestIsSecure(req)),
  );
  return response;
}
