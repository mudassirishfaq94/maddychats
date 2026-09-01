import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { searchUsers, toPublicUser } from "@/server/users";
import { clientIp, jsonError } from "@/server/http";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 40;

/**
 * People search — case-insensitive match on username and display name.
 * The requesting user is always excluded from the results (you cannot start
 * a chat with yourself), and only safe public fields are returned.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(
    `search:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit * 2,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const raw = req.nextUrl.searchParams.get("q") ?? "";
  const q = raw.trim().slice(0, MAX_QUERY_LENGTH);
  if (q.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const found = await searchUsers(q, me.id, 20);
  return NextResponse.json({ users: found.map(toPublicUser) });
}
