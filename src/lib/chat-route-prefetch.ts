import type { ConversationDetail, MessagePage } from "@/lib/types";

export type ChatRouteData = { conversation: ConversationDetail; initial: MessagePage };
const MAX_ENTRIES = 8;
const TTL_MS = 15_000;
const entries = new Map<string, { expiresAt: number; promise: Promise<ChatRouteData> }>();

function keyFor(userId: string, conversationId: string) {
  return `${userId}:${conversationId}`;
}

export function prefetchChatRouteData(userId: string, conversationId: string): Promise<ChatRouteData> {
  const key = keyFor(userId, conversationId);
  const existing = entries.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  entries.delete(key);

  const promise = fetch(`/api/conversations/${encodeURIComponent(conversationId)}/open`, {
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  }).then(async (response) => {
    if (!response.ok) throw new Error("Conversation could not be loaded.");
    const data = await response.json() as { conversation: ConversationDetail; initial: MessagePage };
    return data;
  });

  const entry = { expiresAt: Date.now() + TTL_MS, promise };
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  void promise.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
  return promise;
}

/** Drop another account's data immediately on account changes. */
export function retainChatRouteAccount(userId: string) {
  for (const key of entries.keys()) if (!key.startsWith(`${userId}:`)) entries.delete(key);
}
