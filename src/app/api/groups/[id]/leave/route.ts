import { NextRequest, NextResponse } from "next/server";
import { guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { leaveGroup } from "@/server/chat";
import { publishToConversation, publishToUsers } from "@/server/realtime";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await params; const result = await leaveGroup(id, me.id);
  if (result === "not_found") return jsonError(404, "Group not found.");
  if (result === "owner_must_transfer") return jsonError(409, "Transfer ownership before leaving.");
  await publishToConversation(id, { type: "group:member-removed", conversationId: id, userId: me.id });
  await publishToUsers([me.id], { type: "group:member-removed", conversationId: id, userId: me.id });
  return NextResponse.json({ ok: true });
}
