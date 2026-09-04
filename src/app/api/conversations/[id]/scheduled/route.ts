import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getMembership } from "@/server/chat";
import { scheduleMessage, listScheduledMessages, cancelScheduledMessage } from "@/server/scheduled-messages";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** List scheduled messages for this conversation */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(id, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const scheduled = await listScheduledMessages(id, user.id);
  return NextResponse.json({ scheduled });
}

/** Schedule a new message */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(id, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const text = data.text ? String(data.text).trim() : "";
  const scheduledFor = data.scheduledFor ? new Date(String(data.scheduledFor)) : null;
  const replyToMessageId = data.replyToMessageId ? String(data.replyToMessageId) : null;
  const encrypted = data.encrypted === true;

  if (!text) return jsonError(422, "Message text is required.");
  if (!scheduledFor || isNaN(scheduledFor.getTime())) return jsonError(422, "Valid scheduledFor date is required.");
  if (scheduledFor <= new Date()) return jsonError(422, "Scheduled time must be in the future.");

  const scheduled = await scheduleMessage({
    senderId: user.id,
    conversationId: id,
    text,
    replyToMessageId,
    scheduledFor,
    encrypted,
  });

  return NextResponse.json({ scheduled }, { status: 201 });
}

/** Cancel a scheduled message */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;
  const scheduledId = data.scheduledId ? String(data.scheduledId) : null;

  if (!scheduledId) return jsonError(422, "scheduledId is required.");

  const cancelled = await cancelScheduledMessage(scheduledId, user.id);
  if (!cancelled) return jsonError(404, "Scheduled message not found.");

  return NextResponse.json({ success: true });
}
