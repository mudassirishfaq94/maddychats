import { messageNotificationPresentation, type NotificationMessageKind } from "./notification-presentation";

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
export function nativePushPayload(input: { callCancelled?: boolean; messageRequest?: boolean; recipientId: string; notificationId: string; conversationId: string; messageId: string; actorName?: string; preview?: string; showDetails?: boolean; isGroup?: boolean; groupName?: string | null; encrypted?: boolean; messageKind?: NotificationMessageKind; title?: string; body?: string; callId?: string; silent?: boolean; callTtl?: number }, now = Date.now()) {
  const ttl = input.callId ? Math.min(45, Math.max(1, input.callTtl ?? 45)) : 3600;
  const showDetails = input.showDetails === true;
  const showSender = showDetails && !input.callId && !input.messageRequest;
  // Encrypted is the safe default: an unknown message must never leak text.
  const encrypted = input.encrypted !== false;
  const presentation = input.callId && input.title && input.body
    ? { title: safeNotificationText(input.title, "Circlo", 80), body: safeNotificationText(input.body, "New message. Open Circlo to read it.", 140) }
    : messageNotificationPresentation({
        showDetails,
        isGroup: Boolean(input.isGroup),
        groupName: input.groupName ?? null,
        actorName: input.actorName ?? "Someone",
        // FCM is a delivery hint. Never include message text here, including
        // legacy readable rows; the receiving device may decrypt locally.
        preview: "",
        encrypted: true,
        messageKind: input.messageKind,
      });
  const safePresentation = presentation;
  return {
    data: {
      url: `ziptalks://chat/${input.conversationId}?${input.callId ? `call=${input.callId}` : `message=${input.messageId}`}`,
      tag: input.callId ? `circlo-call-${input.callId}` : `circlo-chat-${input.conversationId}`,
      ...(input.callId ? { callId: input.callId, callCancelled: String(input.callCancelled === true) } : {}),
      messageRequest: String(input.messageRequest === true),
      ...(!input.callId ? { messageKind: input.messageKind ?? "text" } : {}),
      ...(!input.callId && showSender && input.isGroup ? {
        isGroup: "true",
        groupName: safeNotificationText(input.groupName ?? "", "Group chat", 80),
      } : {}),
      recipientId: input.recipientId, eventId: input.notificationId,
      // Timing only: enables Android to separate FCM transport latency from
      // local notification rendering. No personal or message data is added.
      pushSentAtMs: String(now),
      title: safePresentation.title, body: safePresentation.body,
      actorName: input.callId
        ? showDetails ? safeNotificationText(input.actorName, "Circlo", 80) : "Circlo"
        : showSender ? safeNotificationText(input.actorName, "Someone", 80) : "Circlo",
      showDetails: String(showSender),
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
