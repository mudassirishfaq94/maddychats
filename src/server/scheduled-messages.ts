import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { scheduledMessages, messages, users } from "@/db/schema";
import { publishToConversation } from "@/server/realtime";
import { notifyNewMessage } from "@/server/notifications";
import { getMessageDTO } from "@/server/chat";

/** Schedule a message for later delivery */
export async function scheduleMessage(input: {
  senderId: string;
  conversationId: string;
  text: string;
  replyToMessageId?: string | null;
  scheduledFor: Date;
}) {
  const [scheduled] = await db
    .insert(scheduledMessages)
    .values({
      senderId: input.senderId,
      conversationId: input.conversationId,
      text: input.text,
      replyToMessageId: input.replyToMessageId ?? null,
      scheduledFor: input.scheduledFor,
    })
    .returning();

  return scheduled;
}

/** List scheduled messages for a user in a conversation */
export async function listScheduledMessages(
  conversationId: string,
  userId: string,
) {
  return db
    .select()
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.conversationId, conversationId),
        eq(scheduledMessages.senderId, userId),
        eq(scheduledMessages.sent, false),
      ),
    )
    .orderBy(sql`${scheduledMessages.scheduledFor} ASC`);
}

/** Cancel a scheduled message */
export async function cancelScheduledMessage(
  scheduledId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.id, scheduledId),
        eq(scheduledMessages.senderId, userId),
        eq(scheduledMessages.sent, false),
      ),
    )
    .returning();

  return deleted.length > 0;
}

/**
 * Process due scheduled messages — sends them as real messages with
 * real-time delivery and notifications.
 *
 * Call this from a cron endpoint or periodically.
 */
export async function processScheduledMessages(): Promise<{
  processed: number;
  failed: number;
}> {
  const now = new Date();

  const dueMessages = await db
    .select()
    .from(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.sent, false),
        lte(scheduledMessages.scheduledFor, now),
      ),
    )
    .limit(50);

  let processed = 0;
  let failed = 0;

  for (const scheduled of dueMessages) {
    try {
      // 1. Create the actual message
      const [message] = await db
        .insert(messages)
        .values({
          conversationId: scheduled.conversationId,
          senderId: scheduled.senderId,
          text: scheduled.text,
          replyToMessageId: scheduled.replyToMessageId ?? null,
        })
        .returning();

      // 2. Mark scheduled entry as sent
      await db
        .update(scheduledMessages)
        .set({ sent: true, sentMessageId: message.id })
        .where(eq(scheduledMessages.id, scheduled.id));

      // 3. Build full message DTO for real-time delivery
      const messageDto = await getMessageDTO(message.id, scheduled.senderId);
      if (!messageDto) {
        processed++; // Message was created, just DTO failed
        continue;
      }

      // 4. Publish to all conversation members via realtime (Socket.IO polling)
      await publishToConversation(scheduled.conversationId, {
        type: "message:new",
        conversationId: scheduled.conversationId,
        message: messageDto,
      });

      // 5. Send push/in-app notifications
      // Get sender display name for the notification
      const [sender] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, scheduled.senderId))
        .limit(1);

      await notifyNewMessage({
        conversationId: scheduled.conversationId,
        messageId: message.id,
        actorId: scheduled.senderId,
        actorName: sender?.displayName ?? "Scheduled message",
        preview: scheduled.text.slice(0, 140),
      });

      processed++;
    } catch (err) {
      console.error(`[scheduled-messages] Failed to process ${scheduled.id}:`, err);
      failed++;
    }
  }

  return { processed, failed };
}
