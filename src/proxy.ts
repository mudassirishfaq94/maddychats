import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/config";
import { verifySessionToken } from "@/server/jwt";

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

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
