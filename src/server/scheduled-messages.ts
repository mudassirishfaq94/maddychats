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
  encrypted?: boolean;
}) {
  const [scheduled] = await db
    .insert(scheduledMessages)
    .values({
      senderId: input.senderId,
      conversationId: input.conversationId,
      text: input.text,
      replyToMessageId: input.replyToMessageId ?? null,
      scheduledFor: input.scheduledFor,
      encrypted: input.encrypted ?? false,
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
  conversationId?: string,
): Promise<boolean> {
  const deleted = await db
    .delete(scheduledMessages)
    .where(
      and(
        eq(scheduledMessages.id, scheduledId),
        ...(conversationId ? [eq(scheduledMessages.conversationId, conversationId)] : []),
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
  if (process.env.STARTER_MODE === "1" && process.env.SCHEDULED_MESSAGES_ENABLED !== "1") return { processed: 0, failed: 0 };
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
        // Ineligible jobs remain persisted without starving other conversations' due jobs.
        sql`exists(select 1 from conversations c join conversation_members cm on cm.conversation_id=c.id
          where c.id=${scheduledMessages.conversationId} and cm.user_id=${scheduledMessages.senderId}
            and c.deleted_at is null and (not c.admin_only_messaging or cm.role in ('owner','admin'))
            and not exists(select 1 from conversation_members pending where pending.conversation_id=c.id
              and c.type='dm' and pending.user_id<>c.created_by_id and pending.accepted_at is null)
            and not exists(select 1 from conversation_members peer join blocks b
              on (b.blocker_id=${scheduledMessages.senderId} and b.blocked_id=peer.user_id)
                or (b.blocked_id=${scheduledMessages.senderId} and b.blocker_id=peer.user_id)
              where peer.conversation_id=c.id and peer.user_id<>${scheduledMessages.senderId}))`,
      ),
    )
    .orderBy(scheduledMessages.scheduledFor, scheduledMessages.id).limit(50);

  let processed = 0;
  let failed = 0;

  for (const scheduled of dueMessages) {
    try {
      // 1. Create the actual message
      const message = await db.transaction(async (tx) => {
        // Re-check permissions at delivery, not just when the job was created.
        const [job] = await tx.select().from(scheduledMessages).where(and(eq(scheduledMessages.id, scheduled.id), eq(scheduledMessages.sent, false))).for("update");
        if (!job) return null;
        const allowed = await tx.execute<{ allowed: boolean }>(sql`
          select exists(select 1 from conversations c
            join conversation_members cm on cm.conversation_id=c.id and cm.user_id=${scheduled.senderId}
            join users u on u.id=cm.user_id
            where c.id=${scheduled.conversationId} and c.deleted_at is null
              and (not c.admin_only_messaging or cm.role in ('owner','admin'))
              and (u.suspended_at is null or (u.suspended_until is not null and u.suspended_until<now()))
              and (c.slow_mode_seconds=0 or not exists(select 1 from messages recent
                where recent.conversation_id=c.id and recent.sender_id=${scheduled.senderId}
                  and recent.created_at>now()-c.slow_mode_seconds*interval '1 second'))
              and not exists(select 1 from conversation_members peer join blocks b
                on (b.blocker_id=${scheduled.senderId} and b.blocked_id=peer.user_id)
                or (b.blocked_id=${scheduled.senderId} and b.blocker_id=peer.user_id)
                where peer.conversation_id=c.id and peer.user_id<>${scheduled.senderId})
              and (${scheduled.replyToMessageId}::uuid is null or exists(select 1 from messages reply where reply.id=${scheduled.replyToMessageId}::uuid and reply.conversation_id=c.id and reply.deleted_at is null))) as allowed`);
        if (!allowed.rows[0]?.allowed) return null;
        const pending = await tx.execute<{ pending: boolean }>(sql`
          select exists(select 1 from conversations c
            join conversation_members m on m.conversation_id=c.id
            where c.id=${scheduled.conversationId} and c.type='dm'
              and m.user_id<>c.created_by_id and m.accepted_at is null) as pending`);
        if (pending.rows[0]?.pending) return null;
        const [conversation] = await tx.select({ disappearingSeconds: conversations.disappearingSeconds }).from(conversations).where(eq(conversations.id, scheduled.conversationId));
        const [created] = await tx.insert(messages).values({
          conversationId: scheduled.conversationId,
          senderId: scheduled.senderId,
          text: scheduled.text,
          replyToMessageId: scheduled.replyToMessageId ?? null,
          encrypted: scheduled.encrypted,
          expiresAt: conversation?.disappearingSeconds ? new Date(now.getTime() + conversation.disappearingSeconds * 1000) : null,
        }).returning();
        await tx.update(scheduledMessages)
          .set({ sent: true, sentMessageId: created.id })
          .where(and(eq(scheduledMessages.id, scheduled.id), eq(scheduledMessages.sent, false)));
        await tx.update(conversations)
          .set({ lastMessageAt: now, updatedAt: now })
          .where(eq(conversations.id, scheduled.conversationId));
        return created;
      });
      if (!message) continue;

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
        preview: scheduled.encrypted
          ? "\u{1F512} Encrypted message"
          : scheduled.text.slice(0, 140),
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
