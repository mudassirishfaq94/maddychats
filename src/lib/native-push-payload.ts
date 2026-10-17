import { messageNotificationPresentation } from "./notification-presentation";

function safeNotificationText(value: string | undefined, fallback: string, limit: number): string {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, limit).join("") || fallback;
}

/**
 * Message pushes carry a private fallback only. A running recipient WebView
 * may replace it locally after decryption. Call presentation remains separate.
 */
export function nativePushPayload(input: { messageRequest?: boolean; recipientId: string; notificationId: string; conversationId: string; messageId: string; actorName?: string; preview?: string; showDetails?: boolean; isGroup?: boolean; groupName?: string | null; encrypted?: boolean; title?: string; body?: string; callId?: string; silent?: boolean; callTtl?: number }, now = Date.now()) {
  const ttl = input.callId ? Math.min(45, Math.max(1, input.callTtl ?? 45)) : 3600;
  const showDetails = input.showDetails !== false;
  // Encrypted is the safe default: an unknown message must never leak text.
  const encrypted = input.encrypted !== false;
  const presentation = input.title && input.body
    ? { title: safeNotificationText(input.title, "Circlo", 80), body: safeNotificationText(input.body, "New message. Open Circlo to read it.", 140) }
    : messageNotificationPresentation({
        showDetails,
        isGroup: Boolean(input.isGroup),
        groupName: input.groupName ?? null,
        actorName: input.actorName ?? "Someone",
        preview: input.preview ?? "",
        encrypted,
      });
  const safePresentation = input.callId ? presentation : { title: "Circlo", body: "New message received." };
  return {
    data: {
      url: `ziptalks://chat/${input.conversationId}?${input.callId ? `call=${input.callId}` : `message=${input.messageId}`}`,
      tag: input.callId ? `circlo-call-${input.callId}` : `circlo-chat-${input.conversationId}`,
      messageRequest: String(input.messageRequest === true),
      recipientId: input.recipientId, eventId: input.notificationId,
      title: safePresentation.title, body: safePresentation.body,
      actorName: !input.callId ? "Circlo" : showDetails ? safeNotificationText(input.actorName, "Circlo", 80) : "Circlo",
      // Message content never travels through FCM, even for legacy readable rows.
      preview: !input.callId || !showDetails
        ? "New message. Open Circlo to read it."
        : encrypted
        ? "New encrypted message. Open Circlo to read it."
        : safeNotificationText(input.preview, "New message. Open Circlo to read it.", 140),
      silent: String(Boolean(input.silent)), expiresAt: String(now + ttl * 1000),
    },
    android: { priority: "high" as const, ttl: ttl * 1000 },
  };
}
