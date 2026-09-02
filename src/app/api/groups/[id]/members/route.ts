import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, groupMemberSchema } from "@/lib/schemas";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { addGroupMember, getConversationForUser } from "@/server/chat";
import { publishToConversation, publishToUsers } from "@/server/realtime";
import { notifyUser } from "@/server/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
  const parsed = groupMemberSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Invalid member.", fieldErrors(parsed.error));
  const { id } = await params;
  const result = await addGroupMember(id, me.id, parsed.data.userId);
  if (result === "not_found") return jsonError(404, "Group not found.");
  if (result === "forbidden") return jsonError(403, "Only group admins can add members.");
  if (result === "user_not_found") return jsonError(404, "User not found.");
  if (result === "already_member") return jsonError(409, "User is already a member.");
  await publishToConversation(id, { type: "group:member-added", conversationId: id, userId: parsed.data.userId, role: "member" });
  await publishToUsers([parsed.data.userId], { type: "group:member-added", conversationId: id, userId: parsed.data.userId, role: "member" });
  await notifyUser(parsed.data.userId, "member_added", { conversationId: id }, me.id);
  return NextResponse.json({ conversation: await getConversationForUser(id, me.id) });
}
