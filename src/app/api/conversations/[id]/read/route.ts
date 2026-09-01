import { NextRequest, NextResponse } from "next/server";
import { guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { publishToConversation } from "@/server/realtime";
import { getConversationForUser, getMembership, markConversationRead } from "@/server/chat";

export const dynamic = "force-dynamic";

/**
 * Marks every message from other members as read for the caller.
 * Only conversation members may update read state — the membership check
 * runs before anything is written.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(id, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  // Previewing a message request is deliberately private. Until the recipient
  // accepts, no read rows or realtime read receipts are created.
  const conversation = await getConversationForUser(id, me.id);
  if (conversation?.type === "dm" && conversation.requestPending) {
    return NextResponse.json({ ok: true, readCount: 0, requestPending: true });
  }

  const { messageIds, readAt } = await markConversationRead(id, me.id);

  if (messageIds.length > 0) {
    await publishToConversation(id, {
      type: "message:read",
      conversationId: id,
      userId: me.id,
      messageIds,
      readAt: readAt.toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    readCount: messageIds.length,
    readAt: readAt.toISOString(),
  });
}
