import { messageNotificationPresentation, type NotificationPresentation } from "./notification-presentation";

export const LOCKED_CHATS_KEY = "maddy:locked-chats";
export function notificationLockedChatIds(): string[] | null {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(LOCKED_CHATS_KEY) ?? "[]");
    return Array.isArray(ids) && ids.every(id => typeof id === "string") ? ids : null;
  } catch { return null; }
}
export function notificationChatLocked(conversationId: string): boolean {
  const ids = notificationLockedChatIds();
  return ids === null || ids.includes(conversationId);
}
/** Lock UI must use this setter (storage events cover changes in other tabs). */
export function setNotificationLockedChats(ids: string[]): void {
  localStorage.setItem(LOCKED_CHATS_KEY, JSON.stringify([...new Set(ids)]));
  window.dispatchEvent(new Event("maddy:locked-chats"));
}
export async function resolveLocalNotification(
  notificationId: string, recipientId: string,
  decrypt: (ciphertext: string, conversationId: string) => Promise<string>,
  active: () => boolean,
): Promise<(NotificationPresentation & { conversationId: string; messageId: string; silent: boolean; messagePreview?: boolean; senderName?: string; messageText?: string; isGroup?: boolean }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(notificationId)) return null;
  const response = await fetch(`/api/notifications/push/delivery?id=${encodeURIComponent(notificationId)}`, {
    cache: "no-store", signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) return null;
  const detail = await response.json();
  if (detail.recipientId !== recipientId || !active() || typeof detail.conversationId !== "string" || typeof detail.messageId !== "string") return null;
  const id = detail.conversationId;
  let preview = "";
  // Notification previews follow the user's notification preference even when
  // a conversation is marked locked. The ciphertext is fetched for this
  // recipient only and is decrypted locally; plaintext never goes through FCM.
  if (detail.previewAllowed === true && typeof detail.ciphertext === "string") {
    try { preview = detail.encrypted ? await decrypt(detail.ciphertext, id) : detail.ciphertext; } catch { /* Device cannot decrypt: keep a private fallback. */ }
  }
  if (!active()) return null;
  const presentation = messageNotificationPresentation({
    messageRequest: detail.messageRequest === true,
    showDetails: detail.previewAllowed === true && Boolean(preview),
    encrypted: false, preview, actorName: detail.actorName ?? "Someone",
    isGroup: detail.isGroup === true, groupName: detail.groupName ?? null,
  });
  const messagePreview = detail.previewAllowed === true && Boolean(preview);
  return { ...presentation, conversationId: id, messageId: detail.messageId, silent: Boolean(detail.silent),
    ...(messagePreview ? { messagePreview: true, senderName: String(detail.actorName ?? "Someone").slice(0,80),
      messageText: Array.from(preview).slice(0,140).join(""), isGroup: detail.isGroup === true } : {}) };
}
