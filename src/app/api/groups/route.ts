import { NextRequest, NextResponse } from "next/server";
import { createGroupSchema, fieldErrors } from "@/lib/schemas";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { createGroupConversation, getConversationForUser } from "@/server/chat";
import { publishToUsers } from "@/server/realtime";
import { notifyUser } from "@/server/notifications";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Please fix the highlighted fields.", fieldErrors(parsed.error));
  try {
    const conversation = await createGroupConversation({ creatorId: me.id, ...parsed.data });
    const memberIds = [...new Set(parsed.data.memberIds)].filter((id) => id !== me.id);
    publishToUsers([me.id, ...memberIds], { type: "group:created", conversationId: conversation.id });
    await Promise.all(memberIds.map((id) => notifyUser(id, "member_added", { conversationId: conversation.id, groupName: conversation.name }, me.id)));
    return NextResponse.json({ conversation: await getConversationForUser(conversation.id, me.id) }, { status: 201 });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "group_requires_member" || code === "invalid_group_members") return jsonError(422, "Select at least one valid member.");
    throw error;
  }
}
