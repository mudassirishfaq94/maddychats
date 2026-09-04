import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, scheduledMessages, messages, users } from "@/db/schema";
import { publishToConversation } from "@/server/realtime";
import { notifyNewMessage } from "@/server/notifications";
import { getMessageDTO } from "@/server/chat";
import { pool } from "@/db";

const SCHEDULED_PROCESSOR_LOCK = 847_221_903;

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
  const lockClient = await pool.connect();
  const lock = await lockClient.query<{ locked: boolean }>(
    "select pg_try_advisory_lock($1) as locked",
    [SCHEDULED_PROCESSOR_LOCK],
  );
  if (!lock.rows[0]?.locked) {
    lockClient.release();
    return { processed: 0, failed: 0 };
  }

  try {
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
      const message = await db.transaction(async (tx) => {
        const [created] = await tx.insert(messages).values({
          conversationId: scheduled.conversationId,
          senderId: scheduled.senderId,
          text: scheduled.text,
          replyToMessageId: scheduled.replyToMessageId ?? null,
        }).returning();
        await tx.update(scheduledMessages)
          .set({ sent: true, sentMessageId: created.id })
          .where(and(eq(scheduledMessages.id, scheduled.id), eq(scheduledMessages.sent, false)));
        await tx.update(conversations)
          .set({ lastMessageAt: now, updatedAt: now })
          .where(eq(conversations.id, scheduled.conversationId));
        return created;
      });

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
  } finally {
    await lockClient.query("select pg_advisory_unlock($1)", [SCHEDULED_PROCESSOR_LOCK]).catch(() => undefined);
    lockClient.release();
  }
}
