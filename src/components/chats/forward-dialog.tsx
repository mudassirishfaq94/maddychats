"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import type { ConversationSummary, MessageDTO } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

interface ForwardDialogProps {
  open: boolean;
  message: MessageDTO | null;
  onClose: () => void;
  onForward: (conversationId: string) => Promise<void>;
}

/**
 * Full-screen mobile dialog for forwarding a message to another conversation.
 */
export function ForwardDialog({
  open,
  message,
  onClose,
  onForward,
}: ForwardDialogProps) {
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSending(false);
      setSent(false);
      setLoadingConvs(true);
      fetch("/api/conversations", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => setConversations(data.conversations ?? []))
        .catch(() => setConversations([]))
        .finally(() => setLoadingConvs(false));
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !message) return null;

  const filtered = conversations.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const name = (c.name ?? c.otherMember?.displayName ?? "").toLowerCase();
    return name.includes(q);
  });

  async function handleForward(conversationId: string) {
    if (sending) return;
    setSending(true);
    try {
      await onForward(conversationId);
      setSent(true);
      setTimeout(() => onClose(), 600);
    } catch {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--bg)] sm:hidden">
      {/* Header */}
      <div className="flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="flex-1 text-sm font-semibold">Forward to…</span>
      </div>

      {/* Search */}
      <div className="border-b border-[var(--border)] px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-xl bg-[var(--input-bg)] py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-[var(--muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Message preview */}
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">Forwarding:</p>
        <p className="mt-0.5 line-clamp-2 text-sm">
          {message.text || "Attachment"}
        </p>
      </div>

      {/* Conversation list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingConvs ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
          </div>
        ) : sent ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Check className="h-10 w-10 text-green-500" />
            <p className="mt-3 text-sm font-medium">Message forwarded!</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--muted)]">
            No conversations found
          </div>
        ) : (
          <ul>
            {filtered.map((conv) => {
              const name =
                conv.name ?? conv.otherMember?.displayName ?? "Unknown";
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void handleForward(conv.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface)]"
                  >
                    {conv.type === "group" && conv.avatarUrl ? (
                      <img
                        src={conv.avatarUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                      />
                    ) : conv.otherMember ? (
                      <Avatar user={conv.otherMember} size={44} />
                    ) : (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
                        ?
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {name}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">
                        {conv.type === "group"
                          ? `${conv.memberCount ?? 0} members`
                          : "Direct message"}
                      </span>
                    </span>
                    {sending && (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Small check icon for the sent confirmation
function Check({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
