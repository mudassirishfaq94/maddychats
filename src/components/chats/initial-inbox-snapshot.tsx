"use client";
import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useConversationList } from "@/components/providers/conversation-list-provider";
import type { ConversationSummary } from "@/lib/types";

/** Deliver the freshly authorized server read without a post-hydration API waterfall. */
export function InitialInboxSnapshot({ viewerId, conversations }: { viewerId: string; conversations: ConversationSummary[] }) {
  const { user } = useAuth();
  const { seed } = useConversationList();
  useEffect(() => { if (user?.id === viewerId) seed(conversations); }, [user?.id, viewerId, conversations, seed]);
  return null;
}
