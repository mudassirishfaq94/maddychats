import { mapWithConcurrency } from "@/lib/async";

/** Copy every chat a linked source device can open, continuing past individual failures. */
export async function transferDeviceHistory(
  conversationIds: readonly string[],
  sendConversation: (conversationId: string) => Promise<unknown>,
  onProgress?: (completed: number, total: number) => void,
) {
  let completed = 0;
  let sent = 0;
  await mapWithConcurrency(conversationIds, 3, async conversationId => {
    try {
      await sendConversation(conversationId);
      sent++;
    } catch {
      // A missing key in one chat must not stop history from the other chats.
    } finally {
      completed++;
      onProgress?.(completed, conversationIds.length);
    }
  });
  return { sent, total: conversationIds.length };
}
