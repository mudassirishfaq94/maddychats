import { NextRequest, NextResponse } from "next/server";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { clientIp, guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { pinMessage, unpinMessage } from "@/server/chat";
import { publishToConversation } from "@/server/realtime";

export const dynamic = "force-dynamic";

/** Pin a message in a conversation. Permission checked server-side. */
export async function POST(
  _req: NextRequest,
  ctx: {
    params: Promise<{
      id: string;
      messageId: string;
    }>;
  },
) {
  const blocked = guardSameOrigin(_req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `pin:${clientIp(_req)}`,
    AUTH_RATE_LIMIT.limit * 2,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id: conversationId, messageId } = await ctx.params;
  if (!isUuid(conversationId) || !isUuid(messageId))
    return jsonError(404, "Not found.");

  const result = await pinMessage(conversationId, messageId, me.id);
  if (result === "not_found") return jsonError(404, "Message not found.");
  if (result === "forbidden")
    return jsonError(403, "You don't have permission to pin messages.");
  if (result === "already_pinned")
    return jsonError(409, "Message is already pinned.");

  await publishToConversation(conversationId, {
    type: "message:pinned",
    conversationId,
    messageId,
    pinnedBy: me.id,
  });

  return NextResponse.json({ ok: true });
}

/** Unpin a message. */
export async function DELETE(
  _req: NextRequest,
  ctx: {
    params: Promise<{
      id: string;
      messageId: string;
    }>;
  },
) {
  const blocked = guardSameOrigin(_req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id: conversationId, messageId } = await ctx.params;
  if (!isUuid(conversationId) || !isUuid(messageId))
    return jsonError(404, "Not found.");

  const result = await unpinMessage(conversationId, messageId, me.id);
  if (result === "not_found") return jsonError(404, "Pin not found.");
  if (result === "forbidden")
    return jsonError(403, "You don't have permission to unpin messages.");

  await publishToConversation(conversationId, {
    type: "message:unpinned",
    conversationId,
    messageId,
  });

  return NextResponse.json({ ok: true });
}
