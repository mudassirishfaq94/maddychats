"use client";

import { ChatView } from "@/components/chats/chat-view";
import type { ConversationDetail, MessagePage, SafeUser } from "@/lib/types";

/** The server page authorizes membership and loads the first message page. */
export function ChatRoute({ conversationId, me, conversation, initial }: {
  conversationId: string;
  me: SafeUser;
  conversation: ConversationDetail;
  initial: MessagePage;
}) {
  const other = conversation.members.find((member) => member.id !== me.id) ?? null;
  return <ChatView
    key={conversation.id}
    conversationId={conversation.id}
    me={me}
    other={other}
    conversation={conversation}
    initial={initial}
  />;
}
