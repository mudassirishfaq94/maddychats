"use client";

import { useEffect, useState } from "react";
import { SavedChatOpening } from "@/components/chats/saved-chat-opening";
import Link from "next/link";
import { Ghost } from "lucide-react";
import { ChatView } from "@/components/chats/chat-view";
import { useAuth } from "@/components/providers/auth-provider";
import { prefetchChatRouteData, retainChatRouteAccount, type ChatRouteData } from "@/lib/chat-route-prefetch";
import type { SafeUser } from "@/lib/types";

export function ChatRoute({ conversationId, me }: { conversationId: string; me: SafeUser }) {
  const { user, status } = useAuth();
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

    return <SavedChatOpening />;

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
