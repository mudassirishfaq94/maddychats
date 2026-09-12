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
  // Metadata and the initial history are both needed for a valid chat. Start
  // them together to avoid a full extra database round-trip on navigation.
  const detailPromise = isUuid(id) ? getConversationForUser(id, me.id) : Promise.resolve(null);
  const initialPromise = isUuid(id)
    ? listMessages(id, null, MESSAGE_PAGE_SIZE, me.id)
    : Promise.resolve(null);
  const detail = await detailPromise;

  if (!detail) {
    // History was intentionally started in parallel; consume a possible
    // background failure when access is denied and its result is unused.
    void initialPromise.catch(() => undefined);
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
  const initial = await initialPromise;
  // `detail` can only exist for a UUID, which also guarantees the history
  // request above was started. This guard keeps that invariant explicit.
  if (!initial) return null;

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
