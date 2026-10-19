import type { MessageDTO } from "./types";
import type { OfflineHistoryMessage } from "../../public/offline-store.js";
/** Minimal device snapshot. Never retain quotes, filenames or ephemeral content. */
export function offlineHistoryRows(messages: MessageDTO[], plain: ReadonlyMap<string,string>, userId: string, disappearing = false): OfflineHistoryMessage[] {
  return messages.filter(message => !message.sendStatus && !message.deletedForMe).flatMap(message => {
    const kind = message.deletedAt ? "deleted" : message.selfDestruct || message.expiresAt || disappearing ? "ephemeral" : message.type !== "text" && message.type !== "system" ? "media" : "message";
    const text = kind === "message" ? message.encrypted ? plain.get(message.id) : message.text : "";
    if (text === undefined) return [];
    return [{id:message.id,senderId:message.senderId,senderName:message.sender.displayName,createdAt:message.createdAt,kind,text,mine:message.senderId===userId}];
  });
}
