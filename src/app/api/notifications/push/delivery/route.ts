import { callPushDetail } from "@/server/call-push";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, conversationMembers, messages, notifications } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError } from "@/server/http";
import { isUuid } from "@/server/users";
import { getNotificationPreferences } from "@/server/notification-preferences";
import { messageNotificationPresentation } from "@/lib/notification-presentation";

export const dynamic = "force-dynamic";

/** Resolve a push against current account, membership and preferences, never a shared cache. */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !isUuid(id)) return jsonError(422, "Invalid notification.");
  const [notice] = await db.select().from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, user.id))).limit(1);
  if (notice?.type === "call") {
    const callDetail = await callPushDetail(id, user.id);
    return callDetail ? NextResponse.json(callDetail, { headers: { "Cache-Control": "private, no-store" } }) : jsonError(404, "Call unavailable.");
  }
  if (notice?.type !== "message") return jsonError(404, "Notification unavailable.");
  const conversationId = notice?.data?.conversationId;
  const messageId = notice?.data?.messageId;
  if (!notice || notice.readAt || typeof conversationId !== "string" || !isUuid(conversationId) || typeof messageId !== "string" || !isUuid(messageId)) return jsonError(404, "Notification unavailable.");
  const [context] = await db.select({ type: conversations.type, name: conversations.name, deletedAt: conversations.deletedAt, mutedAt: conversationMembers.mutedAt, archivedAt: conversationMembers.archivedAt, messageDeletedAt: messages.deletedAt, expiresAt: messages.expiresAt, encrypted: messages.encrypted,
    hidden: sql<boolean>`exists(select 1 from message_deletions d where d.message_id=${messages.id} and d.user_id=${user.id})`,
    blocked: sql<boolean>`exists(select 1 from blocks b where (b.blocker_id=${user.id} and b.blocked_id=${messages.senderId}) or (b.blocked_id=${user.id} and b.blocker_id=${messages.senderId}))`,
  }).from(conversations)
    .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, conversations.id), eq(conversationMembers.userId, user.id)))
    .innerJoin(messages, and(eq(messages.conversationId, conversations.id), eq(messages.id, messageId)))
    .where(eq(conversations.id, conversationId)).limit(1);
  if (!context || context.deletedAt || context.messageDeletedAt || context.hidden || context.mutedAt || context.archivedAt || (context.expiresAt && context.expiresAt <= new Date()) || (context.type === "dm" && context.blocked)) return jsonError(404, "Notification unavailable.");
  const preferences = await getNotificationPreferences(user.id);
  if (!preferences.pushNotifications || !(context.type === "group" ? preferences.groupNotifications : preferences.messageNotifications)) return jsonError(404, "Notification unavailable.");
  const presentation = messageNotificationPresentation({
    showDetails: preferences.showNotificationDetails,
    isGroup: context.type === "group",
    groupName: context.name,
    actorName: typeof notice.data?.actorName === "string" ? notice.data.actorName : "Someone",
    preview: typeof notice.data?.preview === "string" ? notice.data.preview : "",
    encrypted: Boolean(context.encrypted),
  });
  return NextResponse.json({ recipientId: user.id, conversationId, messageId,
    ...presentation,
    silent: !preferences.notificationSound,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
