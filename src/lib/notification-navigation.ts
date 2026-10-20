const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Notification data is untrusted: allow only first-party app navigation. */
export function notificationPath(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const target = new URL(value, origin);
    if (target.username || target.password) return null;
    if (target.protocol === "ziptalks:" && target.hostname === "chat") {
      const id = target.pathname.split("/").filter(Boolean)[0];
      if (!id) return "/app/chats";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
      return `/app/chats/${id}${target.search}`;
    }
    if (target.origin !== new URL(origin).origin || !["https:", "http:"].includes(target.protocol)) return null;
    if (target.pathname !== "/app" && !target.pathname.startsWith("/app/")) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return null; }
}

/**
 * Keep the conversation a notification pointed at when the session expired.
 * Without this the sign-in page sends the user to the chat list and the
 * tapped conversation has to be found by hand.
 */
export function chatLoginDestination(conversationId: unknown, messageId?: unknown): string {
  if (typeof conversationId !== "string" || !uuid.test(conversationId)) return "/login?next=%2Fapp%2Fchats";
  const target = typeof messageId === "string" && uuid.test(messageId)
    ? `/app/chats/${conversationId}?message=${messageId}`
    : `/app/chats/${conversationId}`;
  return `/login?next=${encodeURIComponent(target)}`;
}
