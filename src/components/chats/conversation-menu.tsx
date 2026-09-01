"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Loader2,
  MailOpen,
  MoreVertical,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { ConversationSummary } from "@/lib/types";

type Action =
  | "pin" | "unpin" | "mute" | "unmute"
  | "archive" | "unarchive" | "markUnread" | "clear";

/**
 * Per-conversation controls. Pin / mute / archive / mark-unread / delete are
 * stored per-user, so acting here never changes the other participant's copy.
 */
export function ConversationMenu({
  conversation,
  onDone,
}: {
  conversation: ConversationSummary;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmClear(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function run(action: Action) {
    setBusy(true);
    try {
      await fetch(`/api/conversations/${conversation.id}/controls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setOpen(false);
      setConfirmClear(false);
      onDone?.();
      if (action === "clear") router.push("/app/chats");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const item =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)]";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Conversation options"
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)]"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreVertical className="h-4 w-4" />
        )}
      </button>

      {open ? (
        <div className="card-glass absolute right-0 top-[calc(100%+6px)] z-50 w-52 max-w-[calc(100vw-1.5rem)] rounded-2xl p-1.5 animate-fade-up">
          <button
            type="button"
            className={`${item} text-[var(--muted)]`}
            onClick={() => run(conversation.pinned ? "unpin" : "pin")}
          >
            {conversation.pinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
            {conversation.pinned ? "Unpin" : "Pin to top"}
          </button>

          <button
            type="button"
            className={`${item} text-[var(--muted)]`}
            onClick={() => run(conversation.muted ? "unmute" : "mute")}
          >
            {conversation.muted ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
            {conversation.muted ? "Unmute" : "Mute notifications"}
          </button>

          <button
            type="button"
            className={`${item} text-[var(--muted)]`}
            onClick={() => run(conversation.archived ? "unarchive" : "archive")}
          >
            {conversation.archived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {conversation.archived ? "Unarchive" : "Archive"}
          </button>

          <button
            type="button"
            className={`${item} text-[var(--muted)]`}
            onClick={() => run("markUnread")}
          >
            <MailOpen className="h-3.5 w-3.5" />
            Mark as unread
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          {confirmClear ? (
            <div className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-2">
              <p className="px-1 pb-1.5 text-[0.68rem] leading-snug text-[var(--muted)]">
                Delete this chat for you only? The other person keeps their copy.
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => run("clear")}
                  className="flex-1 rounded-lg bg-[var(--danger)] px-2 py-1.5 text-[0.68rem] font-semibold text-white"
                >
                  Delete for me
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg px-2 py-1.5 text-[0.68rem] text-[var(--muted)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${item} text-[var(--danger)]`}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete chat
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
