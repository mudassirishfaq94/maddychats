import { decryptKeyFromSender, decryptMessage, decryptPrivateKeyFromStorage, importPrivateKey } from "./crypto";
import type { ConversationDetail, MessageDTO } from "./types";

export type StartupRow = { id: string; text: string; mine: boolean; createdAt: string; deadline: number | null };
export class StartupAccessError extends Error { override readonly name = "StartupAccessError"; }
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

/** APK read-only surface: same primitives/local identity, no registration or key sharing. */
export function createStartupReader(userId: string, isCurrent: () => boolean) {
  const privateKey = (async () => {
    if (!uuid.test(userId) || !isCurrent()) return null;
    const stored = JSON.parse(localStorage.getItem(`e2ee_keypair_${userId}`) ?? "null");
    const restored = JSON.parse(localStorage.getItem(`e2ee_restored_${userId}`) ?? "null");
    const device = restored?.deviceId ?? localStorage.getItem("e2ee_device_id");
    if (typeof device !== "string" || !uuid.test(device) || typeof stored?.encryptedPrivateKey !== "string" || !stored.encryptedPrivateKey.startsWith("v2:")) return null;
    const factor = localStorage.getItem(`e2ee_recovery_${userId}_${device}`);
    if (!factor) return null; // Full client handles legacy/native-store migrations.
    const raw = await decryptPrivateKeyFromStorage(stored.encryptedPrivateKey.slice(3), factor);
    return isCurrent() ? importPrivateKey(raw) : null;
  })().catch(() => null);

  return {
    async read(conversationId: string, signal: AbortSignal): Promise<StartupRow[] | null> {
      if (!uuid.test(conversationId) || !isCurrent()) return [];
      const pair = await privateKey;
      if (!pair || !isCurrent() || !navigator.onLine) return null;
      signal.throwIfAborted();
      const started = performance.now();
      const response = await fetch(`/api/conversations/${conversationId}/open`, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) throw new StartupAccessError("Conversation access could not be confirmed.");
        throw new Error("Conversation is temporarily unavailable.");
      }
      const result = await response.json() as { viewerId: string; conversation: ConversationDetail; initial: { serverNow?: string; messages: MessageDTO[] } };
      signal.throwIfAborted();
      const conversation = result.conversation;
      if (!isCurrent() || result.viewerId !== userId || conversation?.id !== conversationId || !Array.isArray(conversation.members) || !conversation.members.some(member => member.id === userId)) throw new StartupAccessError("Conversation account changed.");
      if (conversation.blocked || conversation.requestPending || conversation.awaitingApproval) throw new StartupAccessError("Conversation access is restricted.");
      if (!Array.isArray(result.initial?.messages)) throw new Error("Conversation could not be read.");
      const received = performance.now(), serverMs = Date.parse(result.initial.serverNow ?? "");
      // Include the full round trip conservatively; the phone clock cannot extend expiry.
      const serverAtReceipt = serverMs + received - started;
      const stored = JSON.parse(localStorage.getItem(`e2ee_sentkeys_${userId}_${conversationId}`) ?? "[]");
      if (!Array.isArray(stored)) return [];
      const keys: CryptoKey[] = [];
      // Bounded newest-key fast path; the full client retains older-key recovery.
      for (const entry of stored.slice(-8).reverse()) {
        signal.throwIfAborted(); if (!isCurrent()) return [];
        if (typeof entry?.wrapped === "string") {
          try { keys.push(await decryptKeyFromSender(entry.wrapped, pair)); } catch { /* Full client can recover other historical copies. */ }
        }
      }
      const rows: StartupRow[] = [];
      for (const message of result.initial.messages.slice(-20)) {
        signal.throwIfAborted(); if (!isCurrent()) return [];
        if (message.type !== "text" || !message.encrypted || message.deletedAt || message.deletedForMe || message.selfDestruct || typeof message.text !== "string") continue;
        const expires = message.expiresAt ? Date.parse(message.expiresAt) : null;
        if (expires !== null && (!Number.isFinite(expires) || !Number.isFinite(serverAtReceipt))) continue;
        const deadline = expires === null ? null : received + expires - serverAtReceipt;
        if (deadline !== null && deadline <= performance.now()) continue;
        for (const key of keys) {
          try {
            const text = await decryptMessage(message.text, key);
            signal.throwIfAborted();
            if (!isCurrent()) return [];
            if (deadline === null || deadline > performance.now()) rows.push({ id: message.id, text, mine: message.senderId === userId, createdAt: message.createdAt, deadline });
            break;
          } catch (error) { if (signal.aborted) throw error; }
        }
      }
      return rows;
    },
  };
}
