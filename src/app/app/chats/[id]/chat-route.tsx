"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ghost, Loader2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ChatView } from "@/components/chats/chat-view";
import { useConversationList } from "@/components/providers/conversation-list-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { prefetchChatRouteData, retainChatRouteAccount, type ChatRouteData } from "@/lib/chat-route-prefetch";
import type { SafeUser } from "@/lib/types";

export function ChatRoute({ conversationId, me }: { conversationId: string; me: SafeUser }) {
  const { user, status } = useAuth();
  const { snapshot } = useConversationList();
  const summary = snapshot?.viewerId === me.id
    ? snapshot.conversations.find((conversation) => conversation.id === conversationId)
    : undefined;
  const routeKey = `${me.id}:${conversationId}`;
  const [result, setResult] = useState<{ key: string; data?: ChatRouteData; error?: string } | null>(null);

  useEffect(() => { retainChatRouteAccount(me.id); }, [me.id]);
  useEffect(() => {
    let active = true;
    if (status === "loading" || user?.id !== me.id) return () => { active = false; };
    void prefetchChatRouteData(me.id, conversationId).then((result) => {
      if (!active || user?.id !== me.id) return;
      if (!result.conversation.members.some((member) => member.id === me.id)) {
        setResult({ key: routeKey, error: "Conversation not found or you no longer have access." });
        return;
      }
      setResult({ key: routeKey, data: result });
    }).catch(() => {
      if (active && user?.id === me.id) setResult({ key: routeKey, error: "Could not load this conversation. Check your connection and try again." });
    });
    return () => { active = false; };
  }, [conversationId, me.id, routeKey, status, user?.id]);

  const data = result?.key === routeKey ? result.data ?? null : null;
  const error = result?.key === routeKey ? result.error ?? null : null;
  if (status !== "loading" && user?.id !== me.id) return <div role="alert" className="p-8 text-center">Your session changed. Please reopen this conversation.</div>;
  if (!data) {
    if (error) return <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <Ghost className="h-9 w-9 text-[var(--muted)]" />
      <h1 className="mt-4 font-display text-xl font-bold">Conversation unavailable</h1>
      <p role="alert" className="mx-auto mt-2 max-w-xs text-sm text-[var(--muted)]">{error}</p>
      <Link href="/app/chats" className="btn btn-secondary mx-auto mt-7">Back to chats</Link>
    </div>;

    const title = summary?.name ?? summary?.otherMember?.displayName ?? "Conversation";
    return <section aria-label="Opening conversation" className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4">
        {summary?.otherMember ? <Avatar user={summary.otherMember} size={40} /> : <span className="h-10 w-10 rounded-full bg-[var(--surface-2)]" />}
        <div className="min-w-0"><h1 className="truncate font-semibold">{title}</h1><p className="text-xs text-[var(--muted)]">Loading messages</p></div>
        <Loader2 aria-hidden="true" className="ml-auto h-4 w-4 animate-spin text-[var(--muted)]" />
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">Getting your messages…</div>
    </section>;
  }

  const other = data.conversation.members.find((member) => member.id !== me.id) ?? null;
  return <ChatView
    key={data.conversation.id}
    conversationId={data.conversation.id}
    me={me}
    other={other}
    conversation={data.conversation}
    initial={data.initial}
  />;
}
