"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Clock3,
  Download,
  Bell,
  BellOff,
  Ban,
  CircleAlert,
  Info,
  Loader2,
  MoreVertical,
  Search,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import type { ConversationDetail, PublicUser } from "@/lib/types";

type Control = "mute" | "unmute" | "archive" | "clear" | "setDisappearing";

export function ChatActionsMenu({
  conversationId,
  conversation,
  other,
  onOpenInfo,
  onOpenSearch,
  onReport,
}: {
  conversationId: string;
  conversation: ConversationDetail;
  other: PublicUser | null;
  onOpenInfo: () => void;
  onOpenSearch: () => void;
  onReport: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [blocked, setBlocked] = useState(conversation.blocked);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirmClear(false);
      }
    };
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function control(action: Control) {
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/controls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) return;
      setOpen(false);
      setConfirmClear(false);
      if (action === "clear") router.push("/app/chats");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!other) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/users/${other.id}/block`, { method: blocked ? "DELETE" : "POST" });
      if (!response.ok) return;
      setBlocked((value) => !value);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setDisappearing(seconds: number) {
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/controls`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setDisappearing", disappearingSeconds: seconds }),
      });
      if (response.ok) { setOpen(false); router.refresh(); }
    } finally { setBusy(false); }
  }

  async function exportChat() {
    setExporting(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/export`);
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `circlo-chat-${conversationId}.json`; link.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } finally { setExporting(false); }
  }

  async function closeChat() {
    await control("archive");
    router.push("/app/chats");
  }

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)]";
  const openInfo = () => { setOpen(false); onOpenInfo(); };
  const openSearch = () => { setOpen(false); onOpenSearch(); };
  const openReport = () => { setOpen(false); onReport(); };
  const openFavorites = () => { setOpen(false); router.push("/app/starred"); };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Chat options"
        aria-expanded={open}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)]"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <MoreVertical className="h-5 w-5" />}
      </button>

      {open ? (
        <div role="menu" className="card-glass absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-2xl p-1.5 shadow-xl">
          <button type="button" role="menuitem" className={item} onClick={openInfo}>
            <Info className="h-4 w-4" />
            {conversation.type === "group" ? "Group info" : "Contact info"}
          </button>
          <button type="button" role="menuitem" className={item} onClick={openSearch}>
            <Search className="h-4 w-4" /> Search messages
          </button>
          <button type="button" role="menuitem" className={item} onClick={openFavorites}>
            <Star className="h-4 w-4" /> Favorites
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button type="button" role="menuitem" className={item} onClick={() => void control(conversation.muted ? "unmute" : "mute")}>
            {conversation.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {conversation.muted ? "Unmute notifications" : "Mute notifications"}
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => void control("archive")}>
            <Archive className="h-4 w-4" /> Archive chat
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => void exportChat()} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export chat
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <p className="px-3 pb-1 pt-1 text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--muted)]">Disappearing messages</p>
          <div className="px-2 pb-1">
            <select aria-label="Disappearing message duration" defaultValue={conversation.disappearingSeconds} onChange={(event) => void setDisappearing(Number(event.target.value))} className="field-input py-2! text-xs!">
              <option value={0}>Off</option><option value={86400}>After 24 hours</option><option value={604800}>After 7 days</option><option value={2592000}>After 30 days</option>
            </select>
          </div>
          <div className="my-1 border-t border-[var(--border)]" />
          {other ? (
            <button type="button" role="menuitem" className={`${item} text-[var(--danger)]`} onClick={() => void toggleBlock()}>
              <Ban className="h-4 w-4" /> {blocked ? "Unblock contact" : "Block contact"}
            </button>
          ) : null}
          {other ? (
            <button type="button" role="menuitem" className={`${item} text-[var(--danger)]`} onClick={openReport}>
              <CircleAlert className="h-4 w-4" /> Report contact
            </button>
          ) : null}
          {confirmClear ? (
            <div className="m-1 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3">
              <p className="text-xs leading-relaxed text-[var(--muted)]">Delete this chat for you only? The other person keeps their messages.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void control("clear")} className="rounded-lg bg-[var(--danger)] px-2.5 py-1.5 text-xs font-semibold text-white">Delete</button>
                <button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--muted)]">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" role="menuitem" className={`${item} text-[var(--danger)]`} onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-4 w-4" /> Delete chat
            </button>
          )}
          <button type="button" role="menuitem" className={`${item} text-[var(--muted)]`} onClick={() => void closeChat()}>
            <XCircle className="h-4 w-4" /> Close chat
          </button>
        </div>
      ) : null}
    </div>
  );
}
