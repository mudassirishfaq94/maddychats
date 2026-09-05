"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import type { ConversationSummary, MessageDTO } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

interface ForwardDialogProps {
  open: boolean;
  message: MessageDTO | null;
  preview: string;
  onClose: () => void;
  onForward: (conversationId: string) => Promise<void>;
}

/**
 * Full-screen mobile dialog for forwarding a message to another conversation.
 */
export function ForwardDialog({
  open,
  message,
  preview,
  onClose,
  onForward,
}: ForwardDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const oldOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    let focusTimer: ReturnType<typeof setTimeout>;
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setQuery(""); setSending(false); setSent(false); setError(null);
      setLoadingConvs(true);
      focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
      try {
        const response = await fetch("/api/conversations", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load conversations.");
        if (!controller.signal.aborted) setConversations(data.conversations ?? []);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load conversations.");
      } finally {
        if (!controller.signal.aborted) setLoadingConvs(false);
      }
    })();
    return () => {
      controller.abort();
      clearTimeout(focusTimer);
      document.body.style.overflow = oldOverflow;
      previousFocus?.focus();
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
    setError(null);
    try {
      await onForward(conversationId);
      setSent(true);
      setTimeout(() => onClose(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forwarding failed. Please try again.");
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 sm:p-6">
    <div role="dialog" aria-modal="true" aria-label="Forward message" className="flex h-full w-full flex-col overflow-hidden bg-[var(--bg)] sm:h-[min(640px,85dvh)] sm:max-w-md sm:rounded-2xl sm:border sm:border-[var(--border)]" onKeyDown={(e) => {
      if (e.key === "Escape" && !sending) onClose();
      if (e.key === "Tab") {
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      {/* Header */}
      <div className="flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3">
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          aria-label="Close forward dialog"
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
          {preview || "Attachment"}
        </p>
      </div>

      {error ? <p role="alert" className="px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
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
    </div>,
    document.body,
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
