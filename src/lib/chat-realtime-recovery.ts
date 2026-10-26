import type { MessageDTO } from "@/lib/types";

/** Merge an authenticated newest-page response without replacing local chat state. */
export function mergeRecentMessages(
  current: MessageDTO[],
  recent: MessageDTO[],
  conversationId: string,
): MessageDTO[] {
  const ids = new Set(current.map(message => message.id));
  const pending = new Set(current.filter(message => message.sendStatus).map(message => message.clientMessageId).filter(Boolean));
  const missing = recent.filter(message =>
    message.conversationId === conversationId &&
    !ids.has(message.id) &&
    !(message.clientMessageId && pending.has(message.clientMessageId)),
  );
  if (!missing.length) return current;
  return [...current, ...missing].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
