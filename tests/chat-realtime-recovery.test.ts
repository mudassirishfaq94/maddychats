import test from "node:test";
import assert from "node:assert/strict";
import { mergeRecentMessages } from "../src/lib/chat-realtime-recovery";
import type { MessageDTO } from "../src/lib/types";

function message(id: string, conversationId = "chat", createdAt = id, clientMessageId: string | null = null): MessageDTO {
  return {
    id, clientMessageId, conversationId, text: "opaque encrypted payload", type: "text", senderId: "peer",
    createdAt, updatedAt: createdAt, editedAt: null, deletedAt: null, expiresAt: null, deliveredAt: null,
    replyToMessageId: null, replyTo: null, reactions: [], readBy: [], attachments: [],
    sender: { id: "peer", username: "peer", displayName: "Peer", avatarUrl: null, bio: null, createdAt, lastSeenAt: null },
    starred: false, deletedForMe: false, pinned: false, forwarded: false, encrypted: true,
  };
}

test("realtime catch-up merges authorized conversation rows in order without replacing optimistic sends", () => {
  const optimistic = { ...message("local", "chat", "2026-01-02", "client-1"), sendStatus: "sending" as const };
  const current = [message("existing", "chat", "2026-01-01"), optimistic];
  const merged = mergeRecentMessages(current, [
    message("other-chat", "other", "2026-01-03"),
    message("server-echo", "chat", "2026-01-02", "client-1"),
    message("newer", "chat", "2026-01-03"),
    message("older-missing", "chat", "2025-12-31"),
  ], "chat");

  assert.deepEqual(merged.map(item => item.id), ["older-missing", "existing", "local", "newer"]);
  assert.equal(merged[2].sendStatus, "sending");
  assert.equal(mergeRecentMessages(merged, [message("existing", "chat", "2026-01-01")], "chat"), merged);
});
