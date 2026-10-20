import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientUrl, googleCallbackUrl } from "@/server/config";
import { clientIp, guardSameOrigin, jsonError, requestIsSecure } from "@/server/http";
import { getSessionAuthTime, getSessionDeviceId, getSessionUser } from "@/server/session";
import { recentlyAuthenticated } from "@/server/authentication";
import { googleLinkBinding } from "@/server/google-link-binding";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { POLICY_VERSION } from "@/lib/policy-consent";

const COOKIE_AGE = 10 * 60;

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const limit = await rateLimit(`google-start:${clientIp(req)}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!limit.allowed) {
    const response = jsonError(429, "Too many sign-in attempts. Please wait before retrying.");
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }
  const mobile = req.nextUrl.searchParams.get("mobile") === "1";
  const codeChallenge = req.nextUrl.searchParams.get("code_challenge");
  if (mobile && !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge ?? "")) {
    return NextResponse.redirect(new URL("/login?error=google_invalid_mobile_request", clientUrl()));
  }
  const linking = req.nextUrl.searchParams.get("mode") === "link";
  if (!linking && (req.nextUrl.searchParams.get("terms") !== "1" || req.nextUrl.searchParams.get("privacy") !== "1")) {
    return NextResponse.redirect(new URL("/login?error=consent_required", clientUrl()));
  }
  const linkUser = linking ? await getSessionUser() : null;
  const linkSessionId = linking ? await getSessionDeviceId() : undefined;
  if (linking && (!linkUser || !linkSessionId || !recentlyAuthenticated(await getSessionAuthTime()))) {
    return NextResponse.redirect(new URL("/login?reauth=1&next=/app/profile", clientUrl()));
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", clientUrl()));
  }
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const next = req.nextUrl.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const redirectUri = googleCallbackUrl();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: "select_account" }).toString();

  const response = NextResponse.redirect(url);
  const options = { httpOnly: true, secure: requestIsSecure(req), sameSite: "lax" as const, path: "/api/auth/google", maxAge: COOKIE_AGE };
  response.cookies.set("google_oauth_state", state, options);
  response.cookies.set("google_oauth_nonce", nonce, options);
  response.cookies.set("google_oauth_verifier", verifier, options);
  response.cookies.set("google_oauth_next", safeNext, options);
  response.cookies.set("google_oauth_mode", linking ? "link" : "signin", options);
  response.cookies.set("google_oauth_link", linking ? googleLinkBinding(linkUser!.id, linkSessionId!, state) : "", options);
  response.cookies.set("google_oauth_policy", req.nextUrl.searchParams.get("terms") === "1" && req.nextUrl.searchParams.get("privacy") === "1" ? POLICY_VERSION : "", options);
  if (mobile) {
    response.cookies.set("google_oauth_mobile", "1", options);
    response.cookies.set("google_oauth_code_challenge", codeChallenge!, options);
  }
  return response;
}
