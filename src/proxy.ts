import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/server/config";
import { verifySessionToken } from "@/server/jwt";
import { rotateDeviceSession, setDeviceCookies } from "@/server/device-sessions";
import { guardSameOrigin } from "@/server/http";
import { contentSecurityPolicy } from "@/lib/content-security-policy";
import { randomBytes } from "node:crypto";

/**
 * Request-time interception (Next.js 16 "Proxy" convention — the successor
 * to middleware.ts). Runs on the Node.js runtime before matched routes.
 *
 * - Unauthenticated visitors of /app/* are redirected to /login (with `next`).
 * - Authentication pages perform their own database-backed session check.
 *
 * Pages and API routes perform their own checks as well (defense in depth),
 * so authorization never depends solely on this layer.
 */

const PROTECTED_PREFIXES = ["/app"];
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publicMetadata = ["/api/app-version", "/api/auth/methods"].includes(pathname);

  let token = req.cookies.get(SESSION_COOKIE)?.value;
  let claims = token ? await verifySessionToken(token) : null;
  let credentials;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!claims && refresh && !publicMetadata && !guardSameOrigin(req)) {
    credentials = await rotateDeviceSession(refresh);
    if (credentials) {
      token = credentials.access;
      req.cookies.set(SESSION_COOKIE, token);
      req.cookies.set(REFRESH_COOKIE, credentials.refresh);
      claims = await verifySessionToken(token);
    }
  }

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (needsAuth && !claims) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set("cookie", req.cookies.toString());
  // Always replace incoming nonce/policy headers; the browser cannot choose them.
  const nonce = randomBytes(18).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const res = NextResponse.next({ request: { headers } });
  // Authenticated API results (including errors) must never be retained by a
  // shared cache or a previous account's browser session. Public release/auth
  // capability metadata keeps its deliberately separate cache policy.
  if (pathname.startsWith("/api/") && !publicMetadata) {
    res.headers.set("Cache-Control", "private, no-store");
  }
  if (!pathname.startsWith("/api/")) {
    res.headers.set(process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", policy);
  }
  if (credentials) setDeviceCookies(res, req, credentials);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/health|api/ready|api/cron|api/security/csp-report|favicon.ico|icons/|brand/|gifs/|stickers/|signal/|sw.js|manifest.webmanifest|theme-init.js).*)"],
};
