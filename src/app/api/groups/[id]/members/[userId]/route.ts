import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, groupRoleSchema } from "@/lib/schemas";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { changeGroupRole, removeGroupMember } from "@/server/chat";
import { publishToConversation, publishToUsers } from "@/server/realtime";
import { notifyUser } from "@/server/notifications";

type Ctx = { params: Promise<{ id: string; userId: string }> };
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id, userId } = await params;
  const result = await removeGroupMember(id, me.id, userId);
  if (result === "not_found" || result === "member_not_found") return jsonError(404, "Group member not found.");
  if (result === "forbidden") return jsonError(403, "You cannot remove this member.");
  if (result === "use_leave") return jsonError(422, "Use leave group to remove yourself.");
  await publishToConversation(id, { type: "group:member-removed", conversationId: id, userId });
  await publishToUsers([userId], { type: "group:member-removed", conversationId: id, userId });
  await notifyUser(userId, "member_removed", { conversationId: id }, me.id);
  return NextResponse.json({ ok: true });
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
  const parsed = groupRoleSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Invalid role.", fieldErrors(parsed.error));
  const { id, userId } = await params;
  const result = await changeGroupRole(id, me.id, userId, parsed.data.role);
  if (result === "not_found" || result === "member_not_found") return jsonError(404, "Group member not found.");
  if (result === "forbidden") return jsonError(403, "Only the owner can change admin roles.");
  await publishToConversation(id, { type: "group:member-updated", conversationId: id, userId, role: parsed.data.role });
  await notifyUser(userId, "admin_change", { conversationId: id, role: parsed.data.role }, me.id);
  return NextResponse.json({ ok: true });
}
