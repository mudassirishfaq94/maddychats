import type { RealtimeEvent } from "@/lib/types";
import { getMessageDTO } from "./chat";

/** Persisted events are delivery hints, not lasting permission to read a row.
 * Rehydrate content for this viewer so a replay cannot restore removed,
 * cleared, individually hidden, expired, or subsequently edited content.
 */
export async function currentMessageEvent(userId: string, event: RealtimeEvent): Promise<RealtimeEvent | null> {
  switch (event.type) {
    case "message:new":
    case "message:update":
    case "message:deleted": {
      const message = await getMessageDTO(event.message.id, userId);
      return message ? { ...event, message } : null;
    }
    default: return event;
  }
}
