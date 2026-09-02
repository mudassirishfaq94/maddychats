import { NextRequest, NextResponse } from "next/server";
import { createDirectConversation, createMessage, getMessageDTO } from "@/server/chat";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { notifyNewMessage } from "@/server/notifications";
import { publishToConversation, publishToUsers } from "@/server/realtime";
import { getSessionUser } from "@/server/session";
import { findVisibleStatus } from "@/server/status";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 1800) return jsonError(422, "Reply must be between 1 and 1800 characters.");
  const { id } = await params; const found = await findVisibleStatus(id, me.id);
  if (!found) return jsonError(404, "Status not found.");
  if (found.status.userId === me.id) return jsonError(403, "You cannot reply to your own status.");
  const { conversation, created } = await createDirectConversation(me.id, found.status.userId);
  const statusText = found.status.type === "text" ? (found.status.text ?? "") : (found.status.text || (found.status.type === "video" ? "Video" : "Photo"));
  const statusPreview = statusText.slice(0, 150);
  const formattedText = `[STATUS_REPLY:${found.status.type}]${statusPreview}[/STATUS_REPLY]
${text}`;
  const message = await createMessage(conversation.id, me.id, formattedText);
  if (created) await publishToUsers([me.id, found.status.userId], { type: "conversation:new", conversationId: conversation.id });
  await publishToConversation(conversation.id, { type: "message:new", conversationId: conversation.id, message: (await getMessageDTO(message.id, me.id)) ?? message });
  await notifyNewMessage({ conversationId: conversation.id, messageId: message.id, actorId: me.id, actorName: me.displayName, preview: text });
  return NextResponse.json({ ok: true, conversationId: conversation.id, messageId: message.id }, { status: 201 });
}
