import type { ConversationDetail, MessagePage } from "@/lib/types";

export type ChatRouteData = { conversation: ConversationDetail; initial: MessagePage };
const MAX_ENTRIES = 8;
const TTL_MS = 15_000;
const OFFLINE_FALLBACK_TTL_MS = 5 * 60_000;
const entries = new Map<string, {
  expiresAt: number;
  offlineExpiresAt: number;
  promise: Promise<ChatRouteData>;
  offlineData?: ChatRouteData;
}>();

function keyFor(userId: string, conversationId: string) {
  return `${userId}:${conversationId}`;
}

export function prefetchChatRouteData(userId: string, conversationId: string): Promise<ChatRouteData> {
  const key = keyFor(userId, conversationId);
  const existing = entries.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const now = Date.now();
  const offlineData = existing && existing.offlineExpiresAt > now ? existing.offlineData : undefined;

  const entry: {
    expiresAt: number;
    offlineExpiresAt: number;
    promise: Promise<ChatRouteData>;
    offlineData?: ChatRouteData;
  } = { expiresAt: now + TTL_MS, offlineExpiresAt: now + OFFLINE_FALLBACK_TTL_MS, promise: Promise.resolve(null as never), offlineData };
  const promise = fetch(`/api/conversations/${encodeURIComponent(conversationId)}/open`, {
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  }).then(async (response) => {
    if (!response.ok) throw new Error("Conversation could not be loaded.");
    const data = await response.json() as { conversation: ConversationDetail; initial: MessagePage };
    entry.offlineData = data;
    entry.offlineExpiresAt = Date.now() + OFFLINE_FALLBACK_TTL_MS;
    return data;
  }).catch((error: unknown) => {
    // A transport failure may use the last member-authorized response from
    // this account. HTTP authorization failures never reach this fallback.
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if ((error instanceof TypeError || offline) && entry.offlineData && entry.offlineExpiresAt > Date.now()) return entry.offlineData;
    throw error;
  });
  entry.promise = promise;
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  void promise.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
  return promise;
}

/** Drop another account's data immediately on account changes. */
export function retainChatRouteAccount(userId: string) {
  for (const key of entries.keys()) if (!key.startsWith(`${userId}:`)) entries.delete(key);
}
