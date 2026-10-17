function safeNotificationText(value: string | undefined, fallback: string, limit: number): string {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, limit).join("") || fallback;
}

/** Keep message text out of routing fields; callers pass generic text for encrypted messages. */
export function nativePushPayload(input: { recipientId: string; notificationId: string; conversationId: string; messageId: string; actorName?: string; preview?: string; callId?: string; silent?: boolean; callTtl?: number }, now = Date.now()) {
  const ttl = input.callId ? Math.min(45, Math.max(1, input.callTtl ?? 45)) : 3600;
  return {
    data: {
      url: `ziptalks://chat/${input.conversationId}?${input.callId ? `call=${input.callId}` : `message=${input.messageId}`}`,
      tag: input.callId ? `circlo-call-${input.callId}` : `circlo-chat-${input.conversationId}`,
      recipientId: input.recipientId, eventId: input.notificationId,
      actorName: safeNotificationText(input.actorName, "Circlo", 80),
      preview: safeNotificationText(input.preview, "New activity. Open Circlo to view it.", 140),
      silent: String(Boolean(input.silent)), expiresAt: String(now + ttl * 1000),
    },
    android: { priority: "high" as const, ttl: ttl * 1000 },
  };
}
