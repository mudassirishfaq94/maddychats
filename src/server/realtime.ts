import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, realtimeEvents } from "@/db/schema";
import type { RealtimeEvent } from "@/lib/types";

const EVENT_TTL_MS = 10 * 60 * 1000;

/** Persist events so every Vercel function instance can deliver them. */
export async function publishToUsers(
  userIds: Iterable<string>,
  event: RealtimeEvent,
): Promise<number> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  await db.insert(realtimeEvents).values(ids.map((userId) => ({ userId, payload: event })));
  if (Math.random() < 0.02) {
    void db.delete(realtimeEvents)
      .where(lt(realtimeEvents.createdAt, new Date(Date.now() - EVENT_TTL_MS)))
      .catch(() => undefined);
  }
  return ids.length;
}

export async function publishToConversation(
  conversationId: string,
  event: RealtimeEvent,
): Promise<number> {
  const rows = await db.select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return publishToUsers(rows.map((row) => row.userId), event);
}

export async function eventsForUser(userId: string, since: Date) {
  return db.select({ id: realtimeEvents.id, payload: realtimeEvents.payload, createdAt: realtimeEvents.createdAt })
    .from(realtimeEvents)
    .where(and(eq(realtimeEvents.userId, userId), gte(realtimeEvents.createdAt, since)))
    .orderBy(asc(realtimeEvents.createdAt))
    .limit(200);
}
