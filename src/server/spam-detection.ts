import { sql, and, gte, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, reports } from "@/db/schema";

/**
 * Spam detection and throttling for Maddy Chats.
 *
 * Checks:
 * 1. Message rate limiting (messages per minute per user)
 * 2. Duplicate message detection
 * 3. Report rate limiting (reports per hour per user)
 * 4. Bulk message detection (many messages in short time)
 */

const MESSAGE_RATE_LIMIT = {
  maxMessages: 30,      // max messages per window
  windowMs: 60_000,     // 1 minute
  burstLimit: 10,       // max messages in 5 seconds
  burstWindowMs: 5_000,
};

const REPORT_RATE_LIMIT = {
  maxReports: 5,        // max reports per window
  windowMs: 3_600_000,  // 1 hour
};

/** Check if a user is sending messages too fast */
export async function isSpammingMessages(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const now = new Date();

  // Check burst limit (10 messages in 5 seconds)
  const burstWindow = new Date(now.getTime() - MESSAGE_RATE_LIMIT.burstWindowMs);
  const [burstResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.senderId, userId),
        gte(messages.createdAt, burstWindow),
      ),
    );

  if (burstResult && burstResult.count >= MESSAGE_RATE_LIMIT.burstLimit) {
    return {
      allowed: false,
      reason: "You're sending messages too fast. Please slow down.",
    };
  }

  // Check rate limit (30 messages in 1 minute)
  const windowStart = new Date(now.getTime() - MESSAGE_RATE_LIMIT.windowMs);
  const [rateResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.senderId, userId),
        gte(messages.createdAt, windowStart),
      ),
    );

  if (rateResult && rateResult.count >= MESSAGE_RATE_LIMIT.maxMessages) {
    return {
      allowed: false,
      reason: "Message rate limit reached. Please wait a moment before sending more.",
    };
  }

  return { allowed: true };
}

/** Check if a user is sending duplicate messages */
export async function isDuplicateMessage(
  userId: string,
  text: string,
  conversationId: string,
): Promise<boolean> {
  if (!text || text.length < 5) return false;

  const recentWindow = new Date(Date.now() - 10_000); // last 10 seconds
  const [dupe] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.senderId, userId),
        eq(messages.text, text),
        eq(messages.conversationId, conversationId),
        gte(messages.createdAt, recentWindow),
      ),
    )
    .limit(1);

  return Boolean(dupe);
}

/** Check if a user is filing reports too fast */
export async function isSpammingReports(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const windowStart = new Date(Date.now() - REPORT_RATE_LIMIT.windowMs);
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, userId),
        gte(reports.createdAt, windowStart),
      ),
    );

  if (result && result.count >= REPORT_RATE_LIMIT.maxReports) {
    return {
      allowed: false,
      reason: "You've submitted too many reports recently. Please try again later.",
    };
  }

  return { allowed: true };
}

/** Check if a conversation is being spammed (many messages from many users in short time) */
export async function isConversationSpammed(
  conversationId: string,
): Promise<{ spammed: boolean }> {
  const windowStart = new Date(Date.now() - 60_000); // last minute
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        gte(messages.createdAt, windowStart),
      ),
    );

  // If 100+ messages in a minute, the conversation is being spammed
  return { spammed: (result?.count ?? 0) >= 100 };
}
