import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { clientIp, jsonError } from "@/server/http";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { searchMessages } from "@/server/chat";

export const dynamic = "force-dynamic";

/**
 * Message search scoped to the caller's own conversations. Authorization is
 * enforced by a membership join in the query itself.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(
    `search-msg:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit * 3,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) return jsonError(429, "Too many searches. Slow down.");

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const results = await searchMessages(me.id, q, 25);
  return NextResponse.json({ results });
}
