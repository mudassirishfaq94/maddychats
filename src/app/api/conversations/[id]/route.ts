import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { publishToUsers } from "@/server/realtime";
import {
  deleteConversation,
  deleteGroup,
  getConversationForUser,
} from "@/server/chat";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/** Conversation detail — members only. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const detail = await getConversationForUser(id, me.id);
  if (!detail) return jsonError(404, "Conversation not found.");

  return NextResponse.json({ conversation: detail });
}

/** Delete a conversation (member only). Messages are removed with it. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  // Capture member ids first so everyone hears about the deletion.
  const detail = await getConversationForUser(id, me.id);
  if (!detail) return jsonError(404, "Conversation not found.");

  if (detail.type === "group") {
    const result = await deleteGroup(id, me.id);
    if (result === "forbidden") return jsonError(403, "Only the group owner can delete this group.");
    if (result === "not_found") return jsonError(404, "Conversation not found.");
  } else {
    const deleted = await deleteConversation(id, me.id);
    if (!deleted) return jsonError(404, "Conversation not found.");
  }

  publishToUsers(
    detail.members.map((m) => m.id),
    { type: "conversation:delete", conversationId: id },
  );

  return NextResponse.json({ ok: true });
}
