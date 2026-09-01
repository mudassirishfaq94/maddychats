import { NextRequest, NextResponse } from "next/server";
import { acceptDirectConversation, getConversationForUser } from "@/server/chat";
import { guardSameOrigin, jsonError } from "@/server/http";
import { publishToConversation } from "@/server/realtime";
import { getSessionUser } from "@/server/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await params;
  const result = await acceptDirectConversation(id, me.id);
  if (result === "not_found") return jsonError(404, "Message request not found.");
  const conversation = await getConversationForUser(id, me.id);
  await publishToConversation(id, {
    type: "conversation:accepted",
    conversationId: id,
    userId: me.id,
  });
  return NextResponse.json({ ok: true, accepted: result === "ok", conversation });
}
