import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChatRoute } from "./chat-route";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { chatLoginDestination } from "@/lib/notification-navigation";
import { getConversationForUser, listMessages } from "@/server/chat";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const me = await getSessionUser();
  const [{ id }, { message }] = await Promise.all([params, searchParams]);
  if (!me) redirect(chatLoginDestination(id, message));
  if (!isUuid(id)) redirect("/app/chats");
  const [conversation, initial] = await Promise.all([
    getConversationForUser(id, me.id),
    listMessages(id, null, 20, me.id),
  ]);
  if (!conversation) redirect("/app/chats");
  return <ChatRoute conversationId={id} me={me} conversation={conversation} initial={initial} />;
}
