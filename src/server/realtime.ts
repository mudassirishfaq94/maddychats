import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, realtimeEvents } from "@/db/schema";
import type { RealtimeEvent } from "@/lib/types";

/** Persist events; the database trigger wakes shared LISTEN subscribers after commit. */
export async function publishToUsers(
  userIds: Iterable<string>,
  event: RealtimeEvent,
): Promise<number> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  await db.insert(realtimeEvents).values(ids.map((userId) => ({ userId, payload: event })));
  return ids.length;
}

/** Expiry runs off the send path; one indexed bounded batch per worker run. */
export async function cleanupRealtimeEvents() {
  const result = await db.execute(sql`
    WITH expired AS (
      SELECT id FROM realtime_events WHERE created_at < now() - interval '10 minutes'
      ORDER BY created_at,id LIMIT 5000 FOR UPDATE SKIP LOCKED
    )
    DELETE FROM realtime_events r USING expired e WHERE r.id=e.id RETURNING r.id
  `);
  return result.rows.length;
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
