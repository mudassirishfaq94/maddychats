/** Minimal routing metadata only; never include names, previews, plaintext or keys. */
export function nativePushPayload(input: { recipientId: string; notificationId: string; conversationId: string; messageId: string; callId?: string; silent?: boolean; callTtl?: number }, now = Date.now()) {
  const ttl = input.callId ? Math.min(45, Math.max(1, input.callTtl ?? 45)) : 3600;
  return {
    data: {
      url: `ziptalks://chat/${input.conversationId}?${input.callId ? `call=${input.callId}` : `message=${input.messageId}`}`,
      tag: input.callId ? `circlo-call-${input.callId}` : `circlo-chat-${input.conversationId}`,
      recipientId: input.recipientId, eventId: input.notificationId,
      silent: String(Boolean(input.silent)), expiresAt: String(now + ttl * 1000),
    },
    android: { priority: "high" as const, ttl: ttl * 1000 },
  };
}
