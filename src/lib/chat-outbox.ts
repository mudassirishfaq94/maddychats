import "client-only";
import type { MessageDTO } from "./types";

type Entry = { message: MessageDTO; plain: string };
type Stored = { id: string; iv: Uint8Array; ciphertext: ArrayBuffer };
const databases = new Map<string, Promise<IDBDatabase>>();
function open(userId: string): Promise<IDBDatabase> {
  let result = databases.get(userId);
  if (!result) {
    result = new Promise((resolve, reject) => {
      const request = indexedDB.open(`circlo-outbox:${userId}`, 2);
      request.onupgradeneeded = () => {
        for (const name of ["keys", "messages", "drafts"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); databases.delete(userId); };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Local message storage is blocked by another tab."));
    });
    databases.set(userId, result);
    void result.catch(() => { if (databases.get(userId) === result) databases.delete(userId); });
  }
  return result;
}

const draftWrites = new Map<string, Promise<void>>();
/** Serialize writes so an older encryption task cannot overwrite a newer draft. */
export function saveChatDraft(userId: string, conversationId: string, plain: string): Promise<void> {
  const id = `draft:${conversationId}`;
  const queueId = `${userId}:${id}`;
  const previous = draftWrites.get(queueId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const db = await open(userId);
    if (!plain) { await operation(db, "drafts", "readwrite", store => store.delete(id)); return; }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, await key(db), new TextEncoder().encode(plain.slice(0, 2000)));
    await operation(db, "drafts", "readwrite", store => store.put({ id, iv, ciphertext } satisfies Stored, id));
  });
  draftWrites.set(queueId, next);
  void next.finally(() => { if (draftWrites.get(queueId) === next) draftWrites.delete(queueId); }).catch(() => {});
  return next;
}

export async function loadChatDraft(userId: string, conversationId: string): Promise<string | null> {
  const id = `draft:${conversationId}`;
  // Navigation may remount the chat while its final encrypted write is pending.
  await draftWrites.get(`${userId}:${id}`)?.catch(() => {});
  const db = await open(userId);
  const record = await operation<Stored | undefined>(db, "drafts", "readonly", store => store.get(id));
  if (!record) return null;
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv), additionalData: new TextEncoder().encode(id) }, await key(db), record.ciphertext);
  return new TextDecoder().decode(bytes).slice(0, 2000);
}
function operation<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
async function key(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await operation<CryptoKey | undefined>(db, "keys", "readonly", store => store.get("device"));
  if (existing) return existing;
  const candidate = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  try {
    await operation(db, "keys", "readwrite", store => store.add(candidate, "device"));
    return candidate;
  } catch {
    // Another tab may have created the key first. Never overwrite it.
    const winner = await operation<CryptoKey | undefined>(db, "keys", "readonly", store => store.get("device"));
    if (!winner) throw new Error("Local message storage is unavailable.");
    return winner;
  }
}
export async function saveQueuedMessage(userId: string, entry: Entry): Promise<void> {
  const db = await open(userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const id = `${entry.message.conversationId}:${entry.message.clientMessageId}`;
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, await key(db), new TextEncoder().encode(JSON.stringify(entry)));
  await operation(db, "messages", "readwrite", store => store.put({ id, iv, ciphertext } satisfies Stored, id));
}
export async function removeQueuedMessage(userId: string, conversationId: string, clientMessageId: string): Promise<void> {
  const db = await open(userId);
  await operation(db, "messages", "readwrite", store => store.delete(`${conversationId}:${clientMessageId}`));
}
export async function loadQueuedMessages(userId: string, conversationId: string): Promise<Entry[]> {
  const db = await open(userId);
  const prefix = `${conversationId}:`;
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  const records = await operation<Stored[]>(db, "messages", "readonly", store => store.getAll(range));
  const deviceKey = await key(db);
  const entries: Entry[] = [];
  for (let index = 0; index < records.length; index++) {
    try {
      const record = records[index];
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv as BufferSource, additionalData: new TextEncoder().encode(record.id) }, deviceKey, record.ciphertext);
      const entry = JSON.parse(new TextDecoder().decode(plain)) as Entry;
      if (entry.message.conversationId === conversationId && entry.message.senderId === userId && entry.message.clientMessageId && typeof entry.plain === "string") entries.push(entry);
    } catch { /* A damaged record cannot authorize a send. */ }
  }
  return entries.sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt));
}
