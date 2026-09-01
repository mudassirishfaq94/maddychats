import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Ghost } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import {
  getConversationForUser,
  listMessages,
  MESSAGE_PAGE_SIZE,
} from "@/server/chat";
import { ChatView } from "@/components/chats/chat-view";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/app/chats");

  const { id } = await params;
  const detail = isUuid(id) ? await getConversationForUser(id, me.id) : null;

  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <Ghost className="h-9 w-9 text-[var(--muted)]" />
        <h1 className="font-display mt-4 text-xl font-bold">
          Conversation not found
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
          It may have been deleted, or you don&apos;t have access to it.
        </p>
        <Link href="/app/chats" className="btn btn-secondary mx-auto mt-7">
          Back to chats
        </Link>
      </div>
    );
  }

  const other = detail.members.find((m) => m.id !== me.id) ?? null;
  const initial = await listMessages(detail.id, null, MESSAGE_PAGE_SIZE, me.id);

  return (
    <ChatView
      conversationId={detail.id}
      me={me}
      other={other}
      conversation={detail}
      initial={initial}
    />
  );
}
