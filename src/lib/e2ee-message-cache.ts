import "client-only";
import { mapWithConcurrency } from "@/lib/async";

import {
  decryptKeyFromSender,
  encryptKeyForUser,
  generateConversationKey,
} from "@/lib/crypto";

const DATABASE = "circlo-verified-message-cache";
const VERSION = 1;
const ENVELOPES = "envelopes";
const MESSAGES = "messages";

type Envelope = { id: string; wrappedKey: string };
type CachedMessage = {
  id: string;
  userId: string;
  sourceCiphertext: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  updatedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ENVELOPES)) database.createObjectStore(ENVELOPES, { keyPath: "id" });
      if (!database.objectStoreNames.contains(MESSAGES)) database.createObjectStore(MESSAGES, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read<T>(store: string, id: string): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    const tx = database.transaction(store, "readonly");
    const request = tx.objectStore(store).get(id);
    return await new Promise<T | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function write(store: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    const tx = database.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

function envelopeId(userId: string, deviceId: string) {
  return `${userId}:${deviceId}`;
}

function messageId(userId: string, conversationId: string, id: string) {
  return `${userId}:${conversationId}:${id}`;
}

function associatedData(userId: string, conversationId: string, id: string, sourceCiphertext: string) {
  return new TextEncoder().encode(`${userId}\u0000${conversationId}\u0000${id}\u0000${sourceCiphertext}`);
}

/** Returns a per-account, per-device cache key. IndexedDB keeps only its RSA
 * wrapped form, which this device's non-extractable private key can recover. */
export async function getMessageCacheKey(
  userId: string,
  deviceId: string,
  keyPair: CryptoKeyPair,
): Promise<CryptoKey> {
  const id = envelopeId(userId, deviceId);
  const envelope = await read<Envelope>(ENVELOPES, id).catch(() => undefined);
  if (envelope?.wrappedKey) {
    try {
      return await decryptKeyFromSender(envelope.wrappedKey, keyPair.privateKey);
    } catch {
      // A keypair change makes old cache content deliberately unreadable.
    }
  }
  const key = await generateConversationKey();
  await write(ENVELOPES, { id, wrappedKey: await encryptKeyForUser(key, keyPair.publicKey) } satisfies Envelope);
  return key;
}

export async function readVerifiedMessage(
  cacheKey: CryptoKey,
  userId: string,
  conversationId: string,
  id: string,
  sourceCiphertext: string,
): Promise<string | undefined> {
  const cached = await read<CachedMessage>(MESSAGES, messageId(userId, conversationId, id)).catch(() => undefined);
  if (!cached || cached.userId !== userId || cached.sourceCiphertext !== sourceCiphertext) return undefined;
  try {
    const bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(cached.iv), additionalData: associatedData(userId, conversationId, id, sourceCiphertext) },
      cacheKey,
      cached.ciphertext,
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

/** One database/transaction for a history page, rather than an open per row. */
export async function readVerifiedMessages(
  cacheKey: CryptoKey, userId: string, conversationId: string,
  messages: Array<{ id: string; text: string }>,
): Promise<Map<string, string>> {
  if (!messages.length) return new Map();
  const database = await openDatabase();
  const rows = new Map<string, CachedMessage>();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(MESSAGES, "readonly");
      for (const message of messages) {
        const request = tx.objectStore(MESSAGES).get(messageId(userId, conversationId, message.id));
        request.onsuccess = () => { if (request.result) rows.set(message.id, request.result as CachedMessage); };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { database.close(); }
  const verified = await mapWithConcurrency(messages, 4, async message => {
    const cached = rows.get(message.id);
    if (!cached || cached.userId !== userId || cached.sourceCiphertext !== message.text) return null;
    try {
      const bytes = await crypto.subtle.decrypt({
        name: "AES-GCM", iv: new Uint8Array(cached.iv),
        additionalData: associatedData(userId, conversationId, message.id, message.text),
      }, cacheKey, cached.ciphertext);
      return [message.id, new TextDecoder().decode(bytes)] as const;
    } catch { return null; }
  });
  return new Map(verified.filter((entry): entry is readonly [string, string] => entry !== null));
}

export async function writeVerifiedMessage(
  cacheKey: CryptoKey,
  userId: string,
  conversationId: string,
  id: string,
  sourceCiphertext: string,
  plaintext: string,
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: associatedData(userId, conversationId, id, sourceCiphertext) },
    cacheKey,
    new TextEncoder().encode(plaintext),
  );
  await write(MESSAGES, {
    id: messageId(userId, conversationId, id), userId, sourceCiphertext,
    iv: iv.buffer, ciphertext, updatedAt: Date.now(),
  } satisfies CachedMessage);
}

/** Logout invalidation: remove only the signed-out account's encrypted cache. */
export async function clearVerifiedMessageCache(userId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    const tx = database.transaction([ENVELOPES, MESSAGES], "readwrite");
    for (const storeName of [ENVELOPES, MESSAGES]) {
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(`${userId}:`)) cursor.delete();
        cursor.continue();
      };
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

/** Remove expired records by exact account/conversation/message key. */
export async function purgeVerifiedMessages(userId:string,conversationId:string,ids:string[]) {
  if(typeof indexedDB==="undefined" || !ids.length)return;
  const database=await openDatabase();
  try {
    const tx=database.transaction(MESSAGES,"readwrite");
    for(const id of ids)tx.objectStore(MESSAGES).delete(messageId(userId,conversationId,id));
    await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  } finally {database.close();}
}
