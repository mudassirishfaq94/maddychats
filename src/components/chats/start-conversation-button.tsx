"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle } from "lucide-react";
import type { ConversationDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Starts (or resumes) the direct conversation with the given user and
 * navigates into it. De-dup is guaranteed server-side via the dmKey unique
 * constraint, so clicking this twice never forks the conversation.
 */
export function StartConversationButton({
  userId,
  className,
  label = "Message",
}: {
  userId: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json().catch(() => null)) as {
        conversation?: ConversationDetail;
      } | null;
      if (res.ok && data?.conversation) {
        router.push(`/app/chats/${data.conversation.id}`);
        router.refresh();
        return;
      }
    } catch {
      // fall through to reset
    }
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={pending}
      className={cn("btn btn-primary", className)}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4" />
      )}
      {pending ? "Opening…" : label}
    </button>
  );
}
