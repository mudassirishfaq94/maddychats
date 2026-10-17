import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, notifications } from "@/db/schema";
import { publishToUsers } from "./realtime";
import { getNotificationPreferences } from "./notification-preferences";
import { sendMessagePush } from "./web-push";
import { messageNotificationPresentation } from "@/lib/notification-presentation";

/**
 * Notification service. Rows persist in PostgreSQL so unread counts survive
 * refreshes, logouts and restarts; realtime events merely mirror them.
 */

export interface NotificationDTO {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actorId: string | null;
}

export function toNotificationDTO(row: {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
  actorId: string | null;
}): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    data: row.data,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    actorId: row.actorId,
  };
}

export async function listNotifications(
  userId: string,
  limit = 30,
): Promise<{ notifications: NotificationDTO[]; unreadCount: number }> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(Math.max(1, limit), 100));

  const unread = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );

  return {
    notifications: rows.map(toNotificationDTO),
    unreadCount: Number(unread[0]?.count ?? 0),
  };
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<NotificationDTO | null> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
      ),
    )
    .returning();
  return rows[0] ? toNotificationDTO(rows[0]) : null;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning();
  return rows.length;
}

async function create(
  userId: string,
  type: string,
  data: Record<string, unknown>,
  actorId: string | null,
): Promise<NotificationDTO> {
  const rows = await db
    .insert(notifications)
    .values({ userId, actorId, type, data })
    .returning();
  const dto = toNotificationDTO(rows[0]);
  await publishToUsers([userId], {
    type: "notification:new",
    notification: dto,
  });
  return dto;
}

export async function notifyUser(
  userId: string,
  type: string,
  data: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  await create(userId, type, data, actorId);
}

/**
 * Fan-out a "new message" notification to every other member who has not
 * muted or archived the conversation. Archived chats stay quiet until the
 * member explicitly brings them back into their active inbox.
 */
export async function notifyNewMessage(input: {
  conversationId: string;
  messageId: string;
  actorId: string;
  actorName: string;
  preview: string;
  persistedRequest?: boolean;
  /** Encrypted messages must never expose their text. Defaults to private. */
  encrypted?: boolean;
}): Promise<void> {
  const members = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, input.conversationId));
  const conversation = await db
    .select({ type: conversations.type, name: conversations.name })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  const isGroup = conversation[0]?.type === "group";

  await Promise.all(
    members
      .filter((m) => m.userId !== input.actorId && m.mutedAt === null && m.archivedAt === null)
      .map(async (m) => {
        const preferences = await getNotificationPreferences(m.userId);
        const enabled = isGroup
          ? preferences.groupNotifications
          : preferences.messageNotifications;
        if (!enabled) return;
        let notificationId: string;
        if (input.persistedRequest) {
          const rows = await db.select().from(notifications).where(and(
            eq(notifications.userId, m.userId),
            eq(notifications.type, "message"),
            sql`${notifications.data}->>'messageId' = ${input.messageId}`,
          )).limit(1);
          if (!rows[0]) return;
          notificationId = rows[0].id;
          await publishToUsers([m.userId], { type: "notification:new", notification: toNotificationDTO(rows[0]) });
        } else notificationId = (await create(
          m.userId,
          "message",
          {
            conversationId: input.conversationId,
            messageId: input.messageId,
            actorName: input.actorName,
            preview: input.preview.slice(0, 140),
          },
          input.actorId,
        )).id;
        if (preferences.pushNotifications) {
          // Resolve the alert text here, where the conversation, the encryption
          // state and the recipient's own preference are all known. Every
          // channel then shows the same sender and preview.
          const presentation = messageNotificationPresentation({
            showDetails: preferences.showNotificationDetails,
            isGroup,
            groupName: conversation[0]?.name ?? null,
            actorName: input.actorName,
            preview: input.preview.slice(0, 140),
            encrypted: input.encrypted !== false,
          });
          await sendMessagePush(m.userId, {
            notificationId,
            title: presentation.title,
            body: presentation.body,
            actorName: input.actorName,
            preview: input.preview.slice(0, 140),
            showDetails: preferences.showNotificationDetails,
            isGroup,
            groupName: conversation[0]?.name ?? null,
            encrypted: input.encrypted !== false,
            silent: !preferences.notificationSound,
            conversationId: input.conversationId,
            messageId: input.messageId,
          });
        }
      }),
  );
}

/** System notification (e.g. blocked/unblocked, admin messages). */
export async function notifySystem(
  userId: string,
  message: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await create(userId, "system", { message, ...extra }, null);
}
