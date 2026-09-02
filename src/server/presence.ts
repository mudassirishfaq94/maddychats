import { and, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, users } from "@/db/schema";
import type { PresenceState } from "@/lib/types";

/**
 * In-process presence registry.
 *
 * Tracks how many live realtime connections each user has (multiple tabs =
 * multiple connections). Presence itself lives in memory — PostgreSQL only
 * stores `lastSeenAt`, and we deliberately DO NOT write on every heartbeat:
 * a write happens on connect, on final disconnect, and at most once per
 * FLUSH_INTERVAL while a session stays open.
 */

const FLUSH_INTERVAL_MS = 60_000;

interface Entry {
  connections: number;
  lastSeenAt: Date;
  lastFlushedAt: number;
}

const globalForPresence = globalThis as typeof globalThis & {
  __maddyPresence?: Map<string, Entry>;
};

const registry: Map<string, Entry> = (globalForPresence.__maddyPresence ??=
  new Map());

export function isOnline(userId: string): boolean {
  const e = registry.get(userId);
  return Boolean(e && e.connections > 0);
}

/** Live realtime connections for a user (used to cap streams per account). */
export function connectionCount(userId: string): number {
  return registry.get(userId)?.connections ?? 0;
}

export function onlineUserIds(): string[] {
  return [...registry.entries()]
    .filter(([, e]) => e.connections > 0)
    .map(([id]) => id);
}

/** Registers a new connection. Returns true when the user just came online. */
export async function addConnection(userId: string): Promise<boolean> {
  const now = new Date();
  const existing = registry.get(userId);
  if (existing && existing.connections > 0) {
    existing.connections += 1;
    existing.lastSeenAt = now;
    return false;
  }
  registry.set(userId, {
    connections: 1,
    lastSeenAt: now,
    lastFlushedAt: Date.now(),
  });
  await writeLastSeen(userId, now);
  return true;
}

/** Drops a connection. Returns true when the user just went offline. */
export async function removeConnection(userId: string): Promise<boolean> {
  const entry = registry.get(userId);
  if (!entry) return false;
  entry.connections = Math.max(0, entry.connections - 1);
  entry.lastSeenAt = new Date();
  if (entry.connections > 0) return false;
  await writeLastSeen(userId, entry.lastSeenAt);
  return true;
}

/**
 * Heartbeat tick — refreshes in-memory presence cheaply and flushes to
 * PostgreSQL at most once per minute per user.
 */
export async function touch(userId: string): Promise<void> {
  const entry = registry.get(userId);
  if (!entry) return;
  const now = new Date();
  entry.lastSeenAt = now;
  if (Date.now() - entry.lastFlushedAt >= FLUSH_INTERVAL_MS) {
    entry.lastFlushedAt = Date.now();
    await writeLastSeen(userId, now);
  }
}

async function writeLastSeen(userId: string, when: Date): Promise<void> {
  try {
    await db.update(users).set({ lastSeenAt: when }).where(eq(users.id, userId));
  } catch {
    // presence must never break the stream
  }
}

/** Every user who shares at least one conversation with `userId`. */
export async function peersOf(userId: string): Promise<string[]> {
  const mine = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  if (mine.length === 0) return [];

  const peers = await db
    .selectDistinct({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      inArray(
        conversationMembers.conversationId,
        mine.map((m) => m.conversationId),
      ),
    );
  return peers.map((p) => p.userId).filter((id) => id !== userId);
}

/** Presence snapshot for a viewer's peers (used on stream connect). */
export async function presenceSnapshotFor(
  userId: string,
): Promise<PresenceState> {
  const ids = await peersOf(userId);
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: users.id, lastSeenAt: users.lastSeenAt })
    .from(users)
    .where(inArray(users.id, ids));

  const state: PresenceState = {};
  for (const row of rows) {
    const entry = registry.get(row.id);
    const online = Boolean(
      (entry && entry.connections > 0) ||
      (row.lastSeenAt && row.lastSeenAt.getTime() >= Date.now() - 90_000),
    );
    const lastSeen = entry?.lastSeenAt ?? row.lastSeenAt ?? null;
    state[row.id] = {
      online,
      lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
    };
  }
  return state;
}

/** Online members of a conversation, excluding the given user. */
export async function onlineMembersOf(
  conversationId: string,
  excludeUserId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(and(
      eq(conversationMembers.conversationId, conversationId),
      ne(conversationMembers.userId, excludeUserId),
      gte(users.lastSeenAt, new Date(Date.now() - 90_000)),
    ));
  return rows.map((r) => r.userId);
}

/** Conversation ids the user belongs to (helper for delivery sweeps). */
export async function conversationIdsOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  return rows.map((r) => r.conversationId);
}
