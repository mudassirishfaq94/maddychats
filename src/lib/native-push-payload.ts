import { messageNotificationPresentation } from "./notification-presentation";

function safeNotificationText(value: string | undefined, fallback: string, limit: number): string {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, limit).join("") || fallback;
}

/**
 * Ready-to-display notification text travels with the push so the installed
 * Android app shows exactly what the browser shows. `actorName`/`preview`
 * remain for clients that still compose their own text.
 */
export function nativePushPayload(input: { recipientId: string; notificationId: string; conversationId: string; messageId: string; actorName?: string; preview?: string; showDetails?: boolean; isGroup?: boolean; groupName?: string | null; encrypted?: boolean; title?: string; body?: string; callId?: string; silent?: boolean; callTtl?: number }, now = Date.now()) {
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
  return {
    data: {
      url: `ziptalks://chat/${input.conversationId}?${input.callId ? `call=${input.callId}` : `message=${input.messageId}`}`,
      tag: input.callId ? `circlo-call-${input.callId}` : `circlo-chat-${input.conversationId}`,
      recipientId: input.recipientId, eventId: input.notificationId,
      title: presentation.title, body: presentation.body,
      actorName: showDetails ? safeNotificationText(input.actorName, "Circlo", 80) : "Circlo",
      // Only a message the server stored as readable text may travel as text.
      preview: !showDetails
        ? "New message. Open Circlo to read it."
        : encrypted
        ? "New encrypted message. Open Circlo to read it."
        : safeNotificationText(input.preview, "New message. Open Circlo to read it.", 140),
      silent: String(Boolean(input.silent)), expiresAt: String(now + ttl * 1000),
    },
    android: { priority: "high" as const, ttl: ttl * 1000 },
  };
}
