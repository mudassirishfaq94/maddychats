import { verifyFreshAuthentication, setAuthenticatedSession, MFA_COOKIE } from "@/server/authentication";
import { rateLimit } from "@/server/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getSessionDeviceId, sessionCookieOptions } from "@/server/session";
import { verifyAndEnable2FA, disable2FA } from "@/server/two-factor";
import { guardSameOrigin, jsonError, readJson, requestIsSecure } from "@/server/http";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/server/config";

export const dynamic = "force-dynamic";

/** Verify TOTP code and enable 2FA, or disable 2FA */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const rl = await rateLimit(`2fa-enable:${user.id}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, "Too many verification attempts.");
  if (!(await verifyFreshAuthentication(user.id, body))) return jsonError(403, "Confirm your password or sign in again before enabling 2FA.");
  const { code } = body;
  if (!code || typeof code !== "string") {
    return jsonError(422, "Verification code is required.");
  }

  const result = await verifyAndEnable2FA(user.id, code.trim(), await getSessionDeviceId());

  if (!result.success) {
    return jsonError(422, result.error ?? "Verification failed.");
  }

  return setAuthenticatedSession(NextResponse.json({ success: true, recoveryCodes: result.recoveryCodes, message: "Two-factor authentication enabled." }), req, result.signInUser, result.mfaTime);
}

/** Disable 2FA */
export async function DELETE(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const rl = await rateLimit(`2fa-disable:${user.id}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, "Too many authentication attempts.");
  const body = await readJson(req);
  if (!(await verifyFreshAuthentication(user.id, body))) return jsonError(403, "Confirm your password and authenticator/recovery code, or sign in again before disabling 2FA.");
  const result = await disable2FA(user.id, await getSessionDeviceId());

  if (!result.success) {
    return jsonError(422, result.error ?? "Could not disable 2FA.");
  }

  const response = NextResponse.json({ success: true, signInRequired: true, message: "Two-factor authentication disabled. Sign in again." }, { headers: { "Cache-Control": "private, no-store" } });
  for (const name of [SESSION_COOKIE, REFRESH_COOKIE, MFA_COOKIE]) response.cookies.set(name, "", { ...sessionCookieOptions(requestIsSecure(req)), maxAge: 0 });
  return response;
}
