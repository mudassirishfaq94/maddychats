import { publishToUsers } from "@/server/realtime";
import { scheduledInstant } from "@/lib/scheduled-time";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getMembership, getConversationForUser, memberIdsOf, isBlockedBetween } from "@/server/chat";
import { scheduleMessage, editScheduledMessage, listScheduledMessages, cancelScheduledMessage } from "@/server/scheduled-messages";
import { startStarterMaintenance } from "@/server/starter-maintenance";
import { rateLimit } from "@/server/rate-limit";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
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
async function saveSchedule(
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

  if (process.env.STARTER_MODE === "1" && process.env.SCHEDULED_MESSAGES_ENABLED !== "1") {
    return jsonError(503, "Scheduled sending is paused. You can send messages now.");
  }
  const detail = await getConversationForUser(id, user.id);
  if (!detail) return jsonError(404, "Conversation not found.");
  if (detail.requestPending || detail.awaitingApproval) return jsonError(403, "Accept the message request before scheduling messages.");
  if (detail.adminOnlyMessaging && !["owner", "admin"].includes(membership.role)) return jsonError(403, "Only group admins can send messages.");
  if (detail.type === "dm") for (const peer of await memberIdsOf(id)) if (peer !== user.id && await isBlockedBetween(user.id, peer)) return jsonError(403, "You cannot send messages in this conversation.");
  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const text = data.text ? String(data.text).trim() : "";
  const scheduledFor = scheduledInstant(data.scheduledFor);
  const replyToMessageId = data.replyToMessageId ? String(data.replyToMessageId) : null;
  const encrypted = data.encrypted === true;

  if (!text) return jsonError(422, "Message text is required.");
  if (!encrypted) return jsonError(422, "End-to-end encrypted message payload required.");
  if (!scheduledFor || isNaN(scheduledFor.getTime())) return jsonError(422, "Use a future scheduledFor timestamp with an explicit UTC offset.");
  if (scheduledFor <= new Date()) return jsonError(422, "Scheduled time must be in the future.");

  if (text.length > 16384) return jsonError(422, "Encrypted message is too large.");
  if (replyToMessageId && !isUuid(replyToMessageId)) return jsonError(422, "Invalid reply target.");
  if (replyToMessageId) {
    const [reply] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, replyToMessageId), eq(messages.conversationId, id), isNull(messages.deletedAt), eq(messages.selfDestruct, false), sql`(${messages.expiresAt} is null or ${messages.expiresAt}>now())`)).limit(1);
    if (!reply) return jsonError(422, "Reply target is not available in this conversation.");
  }
  if (!(await rateLimit(`schedule:${user.id}`, 20, 60000)).allowed) return jsonError(429, "Too many scheduling attempts.");
  startStarterMaintenance();
  const editing = req.method === "PATCH";
  if (editing && (typeof data.scheduledId !== "string" || !isUuid(data.scheduledId))) return jsonError(422, "A valid scheduledId is required.");
  const scheduled = editing ? await editScheduledMessage(String(data.scheduledId), user.id, id, { text, scheduledFor, replyToMessageId }) : await scheduleMessage({
    senderId: user.id,
    conversationId: id,
    text,
    replyToMessageId,
    scheduledFor,
    encrypted,
  });

  if (!scheduled) return jsonError(409, "This scheduled message was sent or cancelled. Refresh the list.");
  await publishToUsers([user.id], { type: "scheduled:changed", conversationId: id });
  return NextResponse.json({ scheduled }, { status: editing ? 200 : 201 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { return saveSchedule(req, ctx); }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) { return saveSchedule(req, ctx); }

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

  if (!scheduledId || !isUuid(scheduledId)) return jsonError(422, "scheduledId is required.");

  const cancelled = await cancelScheduledMessage(scheduledId, user.id, id);
  if (!cancelled) return jsonError(404, "Scheduled message not found.");

  await publishToUsers([user.id], { type: "scheduled:changed", conversationId: id });
  return NextResponse.json({ success: true });
}
