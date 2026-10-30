import { activeAccount, chatLocked, offlineChats, offlineHistory, type OfflineHistoryMessage } from "../../public/offline-store.js";

export type SavedChatSnapshot = { scope: object; id: string; name: string; avatarUrl?: string | null; messages: OfflineHistoryMessage[] };
const entries = new Map<string, { scope: object; promise: Promise<SavedChatSnapshot | null>; value?: SavedChatSnapshot; expires: number }>();
const MAX_ENTRIES = 3;
const TTL = 30_000;

/** Memory-only handoff of the existing encrypted offline store, never a second disk cache. */
export function savedChatSnapshot(userId: string, scope: object, id: string): SavedChatSnapshot | null {
  const entry = entries.get(`${userId}:${id}`);
  if (activeAccount() !== userId || chatLocked(id) || entry?.scope !== scope || entry.expires <= Date.now()) return null;
  return entry.value ?? null;
}

export function invalidateSavedChatSnapshots(userId: string, id?: string): void {
  for (const key of entries.keys()) if (key.startsWith(`${userId}:`) && (!id || key === `${userId}:${id}`)) entries.delete(key);
}

export function prepareSavedChatSnapshot(userId: string, scope: object, id: string): Promise<SavedChatSnapshot | null> {
  if (activeAccount() !== userId || chatLocked(id)) return Promise.resolve(null);
  // Drop another login's plaintext and prevent its pending read from publishing.
  for (const [key, entry] of entries) if (entry.scope !== scope || !key.startsWith(`${userId}:`)) entries.delete(key);
  const key = `${userId}:${id}`, previous = entries.get(key);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const entry: { scope: object; promise: Promise<SavedChatSnapshot | null>; value?: SavedChatSnapshot; expires: number } = {
    scope, expires: Date.now() + TTL, promise: Promise.resolve(null),
  };
  entry.promise = Promise.all([offlineChats(userId), offlineHistory(userId, id)]).then(([chats, history]) => {
    const chat = chats.find(chat => chat.id === id);
    if (entries.get(key) !== entry || activeAccount() !== userId || chatLocked(id) || !chat || chat.locked || chat.blocked || chat.requestPending) return null;
    const value = { scope, id, name: chat.name, avatarUrl: chat.avatarUrl, messages: history.messages.filter(row => row.kind === "message").slice(-60) };
    entry.value = value;
    return value;
  }).catch(() => { if (entries.get(key) === entry) entries.delete(key); return null; });
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return entry.promise;
}
