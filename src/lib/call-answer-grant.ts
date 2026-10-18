import { hasHostedPushBridge, hostedCall } from "./native-push-bridge";

export function validAnswerGrant(value: unknown, userId: string, token: string, now = Date.now()): boolean {
  if (!value || typeof value !== "object") return false;
  const grant = value as { recipientId?: string; token?: string; expiresAt?: number };
  return grant.recipientId === userId && grant.token === token && typeof grant.expiresAt === "number" && grant.expiresAt > now && grant.expiresAt <= now + 45000;
}

/** A URL alone cannot consent to microphone capture. Consume local notification proof. */
export async function consumeCallAnswer(userId: string, callId: string, token: string | null): Promise<boolean> {
  if (!token || !/^[a-f\d-]{36}$/i.test(token)) return false;
  if (hasHostedPushBridge()) return hostedCall("call-answer", { userId, callId, actionToken: token });
  try {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("circlo-notification-privacy", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("locks");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const tx = database.transaction("locks", "readwrite"), store = tx.objectStore("locks");
        const key = `call-action:${callId}`, request = store.get(key); let accepted = false;
        request.onsuccess = () => { accepted = validAnswerGrant(request.result, userId, token); if (accepted) store.delete(key); };
        tx.oncomplete = () => resolve(accepted); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { database.close(); }
  } catch { return false; }
}
