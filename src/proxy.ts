import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE, SESSION_COOKIE } from "@/server/config";
import { verifySessionToken } from "@/server/jwt";
import { rotateDeviceSession, setDeviceCookies } from "@/server/device-sessions";
import { guardSameOrigin, jsonError } from "@/server/http";
import { contentSecurityPolicy } from "@/lib/content-security-policy";
import { randomBytes } from "node:crypto";
import { rateLimit } from "@/server/rate-limit";
import { clientUrl } from "@/server/config";
import { canonicalDestination } from "@/server/canonical-domain";
import { resolveSessionAccess } from "@/server/session";
import { deviceAccessPath } from "@/lib/device-access-navigation";

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
  if (req.method === "GET" || req.method === "HEAD") {
    const destination = canonicalDestination(req.headers.get("host"), pathname, req.nextUrl.search, clientUrl(), process.env.RENDER_EXTERNAL_URL);
    if (destination) return NextResponse.redirect(destination, 307);
  }
  const publicMetadata = ["/api/app-version", "/api/auth/methods", "/.well-known/assetlinks.json"].includes(pathname);

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

  // Backstop for authenticated mutations and administrative reads without a route-specific limiter.
  // Account-bound keys cannot be evaded by spoofing forwarding headers.
  // Auth endpoints retain their own limits; logout must always remain available.
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (claims && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && (mutation || pathname.startsWith("/api/admin/"))) {
    const blocked = guardSameOrigin(req);
    if (blocked) return blocked;
    const limit = await rateLimit(`api-write:${claims.sub}`, 240, 60_000);
    if (!limit.allowed) {
      const response = jsonError(429, "Too many requests. Please wait before trying again.");
      response.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return response;
    }
  }

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (needsAuth && !claims) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Routing is only a convenience; getSessionUser also checks the persisted
  // flag, so APIs and long-lived connections enforce the same restriction.
  if (claims?.devicePending && needsAuth && pathname !== "/app/device-access") {
    const access = token ? await resolveSessionAccess(token) : null;
    if (access?.approvalRequired) return NextResponse.redirect(new URL(deviceAccessPath(pathname + req.nextUrl.search), clientUrl()));
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
