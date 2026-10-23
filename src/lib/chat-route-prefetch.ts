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

  const promise = Promise.all([
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) }),
    fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages?limit=20`, { cache: "no-store", signal: AbortSignal.timeout(10_000) }),
  ]).then(async ([detailResponse, historyResponse]) => {
    if (!detailResponse.ok || !historyResponse.ok) throw new Error("Conversation could not be loaded.");
    const [{ conversation }, initial] = await Promise.all([
      detailResponse.json() as Promise<{ conversation: ConversationDetail }>,
      historyResponse.json() as Promise<MessagePage>,
    ]);
    return { conversation, initial };
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
