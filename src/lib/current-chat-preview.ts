import type { ConversationSummary } from "./types";
export type InboxClock = { serverMs: number; receivedAt: number };
export type CurrentChatPreview = { userId: string; scope: object; conversationId: string; name: string; messageId: string; sourceCiphertext: string; text: string; deadline: number | null };
/** Reuse only content already decrypted from the current authorized inbox.
 * This preview is never persisted, and uses a conservative monotonic expiry. */
export function currentChatPreview(conversation: ConversationSummary, userId: string, scope: object, plaintext: string | undefined, clock: InboxClock | undefined, now: number): CurrentChatPreview | undefined {
  const message = conversation.lastMessage;
  if (!clock || conversation.blocked || conversation.requestPending || !message || message.deletedAt || message.selfDestruct || !message.text || !["text", "system"].includes(message.type) || plaintext === undefined) return;
  const expires = message.expiresAt ? Date.parse(message.expiresAt) : null;
  if (expires !== null && !Number.isFinite(expires)) return;
  const serverNow = clock.serverMs + Math.max(0, now - clock.receivedAt);
  if (expires !== null && expires <= serverNow) return;
  return { userId, scope, conversationId: conversation.id, name: conversation.name ?? conversation.otherMember?.displayName ?? "Chat", messageId: message.id, sourceCiphertext: message.text, text: plaintext, deadline: expires === null ? null : now + expires - serverNow };
}
