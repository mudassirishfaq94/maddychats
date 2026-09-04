import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { scheduledMessages, messages } from "@/db/schema";

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

/** Process due scheduled messages — call this periodically */
export async function processScheduledMessages(): Promise<number> {
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

  for (const scheduled of dueMessages) {
    try {
      // Create the actual message
      const [message] = await db
        .insert(messages)
        .values({
          conversationId: scheduled.conversationId,
          senderId: scheduled.senderId,
          text: scheduled.text,
          replyToMessageId: scheduled.replyToMessageId ?? null,
        })
        .returning();

      // Mark as sent
      await db
        .update(scheduledMessages)
        .set({ sent: true, sentMessageId: message.id })
        .where(eq(scheduledMessages.id, scheduled.id));

      processed++;
    } catch {
      // Skip failed messages — they'll be retried
    }
  }

  return processed;
}
