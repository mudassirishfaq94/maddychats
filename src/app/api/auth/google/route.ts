import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientUrl, googleCallbackUrl } from "@/server/config";
import { requestIsSecure } from "@/server/http";

const COOKIE_AGE = 10 * 60;

export async function GET(req: NextRequest) {
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
  return response;
}
