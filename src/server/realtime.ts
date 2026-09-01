import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import type { RealtimeEvent } from "@/lib/types";

/**
 * In-process realtime pub/sub bus.
 *
 * Every app instance keeps ONE bus per Node process (anchored on globalThis,
 * since Next bundles modules per route entry — same pattern as the DB pool).
 * The managed runtime here cannot host a Socket.IO custom server (the start
 * script is platform-owned), so events travel over a Server-Sent Events
 * route handler instead; the event contract mirrors Socket.IO semantics so
 * a future transport swap touches only this module and the provider hook.
 *
 * Horizontal scale note: for multi-instance deployments, back subscribers
 * with Redis pub/sub behind the same subscribe/publish signatures.
 */

type Listener = (event: RealtimeEvent) => void;

interface Bus {
  byUser: Map<string, Set<Listener>>;
}

const globalForBus = globalThis as typeof globalThis & {
  __maddyRealtimeBus?: Bus;
};

const bus: Bus = (globalForBus.__maddyRealtimeBus ??= { byUser: new Map() });

/** Register a per-user listener; returns the unsubscribe function. */
export function subscribe(userId: string, listener: Listener): () => void {
  let set = bus.byUser.get(userId);
  if (!set) {
    set = new Set();
    bus.byUser.set(userId, set);
  }
  set.add(listener);
  return () => {
    const s = bus.byUser.get(userId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) bus.byUser.delete(userId);
  };
}

/** Push an event to every connected session of each given user. */
export function publishToUsers(
  userIds: Iterable<string>,
  event: RealtimeEvent,
): number {
  let delivered = 0;
  for (const id of userIds) {
    const set = bus.byUser.get(id);
    if (!set) continue;
    for (const fn of set) {
      try {
        fn(event);
        delivered++;
      } catch {
        // a broken listener never takes down the bus
      }
    }
  }
  return delivered;
}

/** Push an event to every member of a conversation. */
export async function publishToConversation(
  conversationId: string,
  event: RealtimeEvent,
): Promise<number> {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return publishToUsers(
    rows.map((r) => r.userId),
    event,
  );
}
