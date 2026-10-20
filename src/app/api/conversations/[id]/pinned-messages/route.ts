import { NextRequest, NextResponse } from "next/server";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { clientIp, guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import {
  pinMessage,
  unpinMessage,
  listPinnedMessages,
  getMembership,
} from "@/server/chat";

export const dynamic = "force-dynamic";

/** List pinned messages in a conversation. Members only. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id: conversationId } = await ctx.params;
  if (!isUuid(conversationId))
    return jsonError(404, "Conversation not found.");

  const membership = await getMembership(conversationId, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const pins = await listPinnedMessages(conversationId, me.id);
  return NextResponse.json({ pins });
}
