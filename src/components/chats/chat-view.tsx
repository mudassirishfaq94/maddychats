"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type * as React from "react";
import {
  AlertTriangle,
  ArrowUp,
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  Info,
  Loader2,
  MoreVertical,
  Pin,
  Reply as ReplyIcon,
  Star,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { ConversationDetail, MessageDTO, MessagePage, PublicUser, SafeUser } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { useRealtime } from "@/components/providers/realtime-provider";
import { MessageActions } from "./message-actions";
import { MessageSearch } from "./message-search";
import { AttachmentList } from "./attachments";
import { ConversationDetails } from "./conversation-details";
import {
  AttachButton,
  AttachmentPreviews,
  useAttachmentUpload,
} from "./attachment-composer";
import { cn, formatDate, timeAgo } from "@/lib/utils";

const NEAR_BOTTOM_PX = 140;

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatDate(iso);
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const dbb = new Date(b);
  return (
    da.getFullYear() === dbb.getFullYear() &&
    da.getMonth() === dbb.getMonth() &&
    da.getDate() === dbb.getDate()
  );
}

/** Sent → Delivered → Read, tinted with the own-bubble secondary color. */
function ReceiptIcon({ message }: { message: MessageDTO }) {
  if (message.readBy.length > 0) {
    return (
      <span title="Read" className="inline-flex items-center gap-0.5 font-semibold text-[var(--accent-fg)]">
        <CheckCheck className="h-3.5 w-3.5 text-sky-400" />
        <span className="text-[0.62rem]">Read</span>
      </span>
    );
  }
  if (message.deliveredAt) {
    return (
      <span title="Delivered" className="inline-flex items-center">
        <CheckCheck className="h-3.5 w-3.5 text-[var(--bubble-own-sub)]" />
      </span>
    );
  }
  return (
    <span title="Sent" className="inline-flex items-center">
      <Check className="h-3.5 w-3.5 text-[var(--bubble-own-sub)]" />
    </span>
  );
}

export function ChatView({
  conversationId,
  me,
  other,
  conversation,
  initial,
}: {
  conversationId: string;
  me: SafeUser;
  other: PublicUser | null;
  conversation: ConversationDetail;
  initial: MessagePage;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { subscribe, presence } = useRealtime();

  const [items, setItems] = useState<MessageDTO[]>(initial.messages);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; mode: "for_me" | "for_everyone" } | null>(null);
  const [confirmConvDelete, setConfirmConvDelete] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hasPinnedMsgs, setHasPinnedMsgs] = useState(false);
  const [pinnedCount, setPinnedCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [otherTyping, setOtherTyping] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(!conversation.requestPending);
  const [acceptingRequest, setAcceptingRequest] = useState(false);
  const attachments = useAttachmentUpload();

  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const initialScrollDone = useRef(false);
  const nodeRefs = useRef(new Map<string, HTMLDivElement | null>());
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGroup = conversation.type === "group";
  const otherName = isGroup ? conversation.name ?? "Group" : other?.displayName ?? "Unknown member";
  const otherPresence = other ? presence[other.id] : undefined;
  const otherOnline = Boolean(otherPresence?.online);
  const otherLastSeen = otherPresence?.lastSeenAt ?? other?.lastSeenAt ?? null;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenu(false);
        setConfirmConvDelete(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  /* ------------------------------ read receipts ----------------------------- */

  const markRead = useCallback(async () => {
    if (!requestAccepted) return;
    try {
      // The endpoint emits message:read when rows change; ChatsLayout then
      // performs one debounced refresh. Do not duplicate that request here.
      await fetch(`/api/conversations/${conversationId}/read`, {
        method: "POST",
      });
    } catch {
      // best-effort
    }
  }, [conversationId, requestAccepted]);

  async function acceptMessageRequest() {
    setAcceptingRequest(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/accept`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not accept this message request.");
      setRequestAccepted(true);
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setAcceptingRequest(false);
    }
  }

  useEffect(() => {
    void markRead();
  }, [markRead]);

  /* ---------------------------- typing state ----------------------------- */

  const signalTyping = useCallback(
    (typing: boolean) => {
      if (typingActiveRef.current === typing) return;
      typingActiveRef.current = typing;
      void fetch(`/api/conversations/${conversationId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing }),
        keepalive: !typing,
      }).catch(() => undefined);
    },
    [conversationId],
  );

  const noteTyping = useCallback(() => {
    signalTyping(true);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => signalTyping(false), 1400);
  }, [signalTyping]);

  const clearTypingTimers = useCallback(() => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
  }, []);

  useEffect(() => {
    return () => {
      clearTypingTimers();
      signalTyping(false);
    };
  }, [clearTypingTimers, signalTyping]);

  /* ------------------------- realtime subscriptions ------------------------ */

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "message:pinned" && event.conversationId === conversationId) {
        setHasPinnedMsgs(true);
        setPinnedCount((c) => c + 1);
        setItems((prev) => prev.map((m) => m.id === event.messageId ? { ...m, pinned: true } : m));
        return;
      }
      if (event.type === "message:unpinned" && event.conversationId === conversationId) {
        setPinnedCount((c) => {
          const next = c - 1;
          if (next <= 0) setHasPinnedMsgs(false);
          return Math.max(0, next);
        });
        setItems((prev) => prev.map((m) => m.id === event.messageId ? { ...m, pinned: false } : m));
        return;
      }
      if (event.type === "message:deleted_for_me" && event.conversationId === conversationId) {
        setItems((prev) => prev.filter((message) => message.id !== event.messageId));
        setGalleryRevision((value) => value + 1);
        return;
      }
      if (
        event.type === "conversation:delete" &&
        event.conversationId === conversationId
      ) {
        router.push("/app");
        router.refresh();
        return;
      }
      if (event.type === "message:read" && event.conversationId === conversationId) {
        const ids = new Set(event.messageIds);
        setItems((prev) =>
          prev.map((m) =>
            ids.has(m.id) && !m.readBy.some((r) => r.userId === event.userId)
              ? {
                  ...m,
                  readBy: [
                    ...m.readBy,
                    { userId: event.userId, readAt: event.readAt },
                  ],
                }
              : m,
          ),
        );
        return;
      }
      if (event.type === "message:delivered" && event.conversationId === conversationId) {
        const ids = new Set(event.messageIds);
        setItems((prev) =>
          prev.map((m) =>
            ids.has(m.id) && !m.deliveredAt
              ? { ...m, deliveredAt: event.deliveredAt }
              : m,
          ),
        );
        return;
      }
      if (!("message" in event) || event.conversationId !== conversationId) {
        return;
      }
      const msg = event.message;
      if (event.type === "message:new") {
        setItems((prev) =>
          prev.some((m) => m.id === msg.id)
            ? prev
            : [...prev, msg].sort((a, b) =>
                a.createdAt.localeCompare(b.createdAt),
              ),
        );
        if (msg.senderId !== me.id && document.visibilityState === "visible") {
          void markRead();
        }
      } else {
        setItems((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
    });
  }, [subscribe, conversationId, router, me.id, markRead]);

  /* ----------------------------- scroll helpers ---------------------------- */

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      scrollToBottom(false);
    }
  }, [scrollToBottom]);

  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = items[items.length - 1];
    if (!last || last.id === lastIdRef.current) return;
    lastIdRef.current = last.id;
    if (last.senderId === me.id || nearBottomRef.current) {
      scrollToBottom(true);
    }
  }, [items, me.id, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function jumpTo(messageId: string) {
    const node = nodeRefs.current.get(messageId);
    if (!node) {
      setError("That message is further back — load older messages to see it.");
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId(null), 1600);
  }

  // Deep link (?message=<id>) locates the target message.
  const targetMessageId = searchParams.get("message");
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetMessageId || jumpedRef.current === targetMessageId) return;
    const node = nodeRefs.current.get(targetMessageId);
    if (!node) return;
    jumpedRef.current = targetMessageId;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(targetMessageId);
    setTimeout(() => setHighlightId(null), 2200);
  }, [targetMessageId, items]);

  /* --------------------------- pagination (older) -------------------------- */

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || !nextCursor) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => null)) as MessagePage & {
        error?: string;
      };
      if (!res.ok) {
        setError(data?.error ?? "Could not load older messages.");
        return;
      }
      setItems((prev) => [...data.messages, ...prev]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (node) node.scrollTop = node.scrollHeight - prevHeight + prevTop;
      });
    } catch {
      setError("Network error while loading older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, nextCursor]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadOlder();
      },
      { root: scrollRef.current, rootMargin: "120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadOlder]);

  /* ------------------------------- mutations ------------------------------- */

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    signalTyping(false);

    if (attachments.pending.length > 0) {
      if (sendPending) return;
      setSendPending(true);
      setError(null);
      const result = await attachments.upload(
        conversationId,
        text,
        replyTo?.id ?? null,
      );
      setSendPending(false);
      if (!result.ok) {
        if (result.error !== "Upload cancelled.") setError(result.error);
        return;
      }
      const created = result.message;
      setItems((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created],
      );
      setDraft("");
      setReplyTo(null);
      nearBottomRef.current = true;
      scrollToBottom(true);
      router.refresh();
      return;
    }

    if (!text || sendPending) return;
    setSendPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, replyToMessageId: replyTo?.id ?? null }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: MessageDTO;
        error?: string;
      } | null;
      if (!res.ok || !data?.message) {
        setError(data?.error ?? "Message failed to send. Try again.");
        return;
      }
      const created = data.message;
      setItems((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created],
      );
      setDraft("");
      setReplyTo(null);
      nearBottomRef.current = true;
      scrollToBottom(true);
      const ta = composerRef.current;
      if (ta) ta.style.height = "auto";
    } catch {
      setError("Network error. Message was not sent.");
    } finally {
      setSendPending(false);
      composerRef.current?.focus();
    }
  }

  async function toggleReaction(message: MessageDTO, emoji: string) {
    const mine = message.reactions.find((r) => r.emoji === emoji)?.mine;
    try {
      const res = mine
        ? await fetch(
            `/api/messages/${message.id}/reactions?emoji=${encodeURIComponent(emoji)}`,
            { method: "DELETE" },
          )
        : await fetch(`/api/messages/${message.id}/reactions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emoji }),
          });
      const data = (await res.json().catch(() => null)) as {
        message?: MessageDTO;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Reaction failed.");
        return;
      }
      if (data?.message) {
        const updated = data.message;
        setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      }
    } catch {
      setError("Network error while reacting.");
    }
  }

  async function saveEdit(id: string) {
    const text = editDraft.trim();
    if (!text) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: MessageDTO;
        error?: string;
      } | null;
      if (!res.ok || !data?.message) {
        setError(data?.error ?? "Edit failed. Try again.");
        return;
      }
      const updated = data.message;
      setItems((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingId(null);
    } catch {
      setError("Network error while editing.");
    } finally {
      setBusyId(null);
    }
  }

  async function executeDelete(id: string, mode: "for_me" | "for_everyone" = "for_me") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: MessageDTO;
        error?: string;
      } | null;
      if (!res.ok || !data?.message) {
        setError(data?.error ?? "Delete failed. Try again.");
        return;
      }
      if (mode === "for_me") {
        // Remove from visible list immediately
        setItems((prev) => prev.filter((m) => m.id !== id));
        setGalleryRevision((value) => value + 1);
      } else {
        const updated = data.message;
        setItems((prev) => prev.map((m) => (m.id === id ? updated : m)));
      }
      setPendingDelete(null);
    } catch {
      setError("Network error while deleting.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteConversation() {
    await fetch(`/api/conversations/${conversationId}`, {
      method: "DELETE",
    }).catch(() => null);
    router.push("/app");
    router.refresh();
  }

  async function toggleStar(message: MessageDTO) {
    const endpoint = message.starred
      ? `/api/messages/${message.id}/star`
      : `/api/messages/${message.id}/star`;
    const method = message.starred ? "DELETE" : "POST";
    try {
      const res = await fetch(endpoint, { method });
      const data = (await res.json().catch(() => null)) as {
        message?: MessageDTO;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Star action failed.");
        return;
      }
      if (data?.message) {
        setItems((prev) => prev.map((m) => (m.id === data.message!.id ? data.message! : m)));
      }
    } catch {
      setError("Network error while starring.");
    }
  }

  async function togglePin(message: MessageDTO) {
    const endpoint = `/api/conversations/${conversationId}/messages/${message.id}/pin`;
    const method = message.pinned ? "DELETE" : "POST";
    try {
      const res = await fetch(endpoint, { method });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Pin action failed.");
        return;
      }
      // Update local state immediately
      setItems((prev) => prev.map((m) =>
        m.id === message.id ? { ...m, pinned: !message.pinned } : m,
      ));
      if (message.pinned) {
        setPinnedCount((c) => {
          const next = c - 1;
          if (next <= 0) setHasPinnedMsgs(false);
          return Math.max(0, next);
        });
      } else {
        setHasPinnedMsgs(true);
        setPinnedCount((c) => c + 1);
      }
    } catch {
      setError("Network error while pinning.");
    }
  }

  function copyText(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {
      setError("Clipboard is unavailable in this browser.");
    });
  }

  /* -------------------------------- composer ------------------------------- */

  function growComposer() {
    const ta = composerRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }

  function onComposerKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
    if (e.key === "Escape") setReplyTo(null);
  }

  /* -------------------------------- render --------------------------------- */

  // Filter out messages deleted-for-me and compute grouped view.
  const visibleItems = useMemo(
    () => items.filter((m) => !m.deletedForMe),
    [items],
  );

  const grouped = useMemo(
    () =>
      visibleItems.map((msg, i) => ({
        msg,
        showDate: i === 0 || !sameDay(visibleItems[i - 1].createdAt, msg.createdAt),
        sameSenderPrev:
          i > 0 &&
          visibleItems[i - 1].senderId === msg.senderId &&
          !msg.replyTo &&
          sameDay(visibleItems[i - 1].createdAt, msg.createdAt) &&
          new Date(msg.createdAt).getTime() -
            new Date(visibleItems[i - 1].createdAt).getTime() <
            5 * 60_000,
      })),
    [visibleItems],
  );

  const firstPinned = useMemo(
    () => visibleItems.find((m) => m.pinned),
    [visibleItems],
  );
  const mentionMatch = isGroup ? draft.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/) : null;
  const mentionOptions = mentionMatch ? conversation.members
    .filter((member) => member.id !== me.id && (member.username.toLowerCase().startsWith(mentionMatch[1].toLowerCase()) || member.displayName.toLowerCase().includes(mentionMatch[1].toLowerCase())))
    .slice(0, 6) : [];
  function insertMention(username: string) {
    setDraft((value) => value.replace(/@([a-zA-Z0-9_]*)$/, `@${username} `));
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* ------------------------------ header ------------------------------ */}
      <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4">
        <Link
          href="/app/chats"
          aria-label="Back to chats"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)] lg:hidden"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        {isGroup ? (
          <button type="button" onClick={() => setShowDetails(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            {conversation.avatarUrl ? <img src={conversation.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]"><Users className="h-4 w-4 text-[var(--accent-fg)]" /></span>}
            <span className="min-w-0"><span className="block truncate text-[0.92rem] font-semibold leading-tight">{otherName}</span><span className="block truncate text-[0.72rem] text-[var(--muted)]">{conversation.members.length} members</span></span>
          </button>
        ) : other ? (
          <Link
            href={`/app/users/${other.id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <span className="relative shrink-0">
              <Avatar user={other} size={36} />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface)]",
                  otherOnline
                    ? "bg-[var(--accent)] pulse-dot"
                    : "bg-[var(--muted)] opacity-60",
                )}
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.92rem] font-semibold leading-tight">
                {otherName}
              </span>
              <span
                className={cn(
                  "block truncate text-[0.72rem] leading-tight",
                  otherOnline ? "text-[var(--accent-fg)]" : "text-[var(--muted)]",
                )}
              >
                {otherOnline
                  ? "Online"
                  : otherLastSeen
                    ? `Last seen ${timeAgo(otherLastSeen)}`
                    : "Offline"}
              </span>
            </span>
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="text-sm text-[var(--muted)]">Conversation</span>
          </div>
        )}

        <MessageSearch />

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-label="Chat details"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            showDetails
              ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]"
              : "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)]",
          )}
        >
          <Info className="h-4 w-4" />
        </button>

        <div ref={headerMenuRef} className="relative">
          <button
            type="button"
            aria-label="Conversation options"
            aria-haspopup="menu"
            aria-expanded={headerMenu}
            onClick={() => setHeaderMenu((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)]"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {headerMenu ? (
            <div className="card-glass absolute right-0 top-[calc(100%+8px)] z-50 w-52 max-w-[calc(100vw-1.5rem)] rounded-2xl p-1.5 animate-fade-up">
              {!isGroup && other ? (
                <Link
                  href={`/app/users/${other.id}`}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)] hover:text-[var(--text)]"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  View profile
                </Link>
              ) : null}
              {confirmConvDelete ? (
                <div className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] p-2.5">
                  <p className="px-1 pb-2 text-[0.7rem] leading-snug text-[var(--muted)]">
                    Delete this conversation?
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={deleteConversation}
                      className="flex-1 rounded-lg bg-[var(--danger)] px-2 py-1.5 text-[0.7rem] font-semibold text-white"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmConvDelete(false);
                        setHeaderMenu(false);
                      }}
                      className="rounded-lg px-2 py-1.5 text-[0.7rem] text-[var(--muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmConvDelete(true)}
                  disabled={isGroup && conversation.myRole !== "owner"}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_9%,transparent)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isGroup ? "Delete group" : "Delete conversation"}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {!requestAccepted ? (
        <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-4 py-3">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Message request</p>
              <p className="text-xs text-[var(--muted)]">Preview privately. The sender will not see a read receipt until you accept.</p>
            </div>
            <button type="button" disabled={acceptingRequest} onClick={() => void acceptMessageRequest()} className="btn btn-primary shrink-0 px-3! py-2! text-xs!">
              {acceptingRequest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Accept"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Pinned message indicator */}
      {hasPinnedMsgs && firstPinned ? (
        <button
          type="button"
          onClick={() => {
            // Find the pinned message and scroll to it
            const node = nodeRefs.current.get(firstPinned.id);
            if (node) {
              node.scrollIntoView({ behavior: "smooth", block: "center" });
              setHighlightId(firstPinned.id);
              setTimeout(() => setHighlightId(null), 1600);
            }
          }}
          className="flex items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] px-4 py-2 text-left text-xs text-[var(--accent-fg)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
        >
          <Pin className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {pinnedCount === 1
              ? `Pinned message — ${firstPinned.text ? firstPinned.text.slice(0, 60) : "Attachment"}`
              : `${pinnedCount} pinned messages`}
          </span>
        </button>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-2.5 text-sm text-[var(--danger)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* --------------------------- message list ---------------------------- */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) {
            attachments.addFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6",
          dragging && "outline-2 outline-dashed outline-offset-[-10px] outline-[var(--accent)]",
        )}
      >
        {dragging ? (
          <div className="pointer-events-none sticky top-2 z-30 mx-auto w-fit rounded-full bg-[var(--action)] px-4 py-1.5 text-xs font-semibold text-[var(--action-fg)]">
            Drop files to attach
          </div>
        ) : null}

        {hasMore ? (
          <div ref={topSentinelRef} className="flex justify-center py-2">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="btn btn-ghost py-1.5! text-xs!"
            >
              {loadingOlder ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5" />
              )}
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        ) : items.length > 0 ? (
          <p className="py-3 text-center text-[0.64rem] font-medium uppercase tracking-widest text-[var(--muted)] opacity-70">
            Beginning of conversation
          </p>
        ) : null}

        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <Avatar user={other ?? me} size={64} />
            <p className="mt-5 font-semibold">No messages yet</p>
            <p className="mt-1.5 max-w-[15rem] text-sm leading-relaxed text-[var(--muted)]">
              Say hello to {otherName.split(" ")[0]}.
            </p>
          </div>
        ) : (
          <div className="pb-4">
            {grouped.map(({ msg, showDate, sameSenderPrev }) => {
              const own = msg.senderId === me.id;
              const deleted = msg.deletedAt !== null;
              return (
                <div
                  key={msg.id}
                  ref={(node) => {
                    nodeRefs.current.set(msg.id, node);
                  }}
                >
                  {showDate ? (
                    <div className="my-4 flex items-center gap-4">
                      <span className="h-px flex-1 bg-[var(--border)]" />
                      <span className="text-[0.66rem] font-medium text-[var(--muted)]">
                        {dayLabel(msg.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "group flex w-full",
                      own ? "justify-end" : "justify-start",
                      sameSenderPrev ? "mt-0.5" : "mt-2.5",
                      highlightId === msg.id &&
                        "rounded-xl ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[color-mix(in_srgb,var(--accent)_20%,transparent)] transition-shadow duration-500",
                    )}
                  >
                    {!own ? (
                      <span className="mr-2 mt-auto w-7 shrink-0">
                        {!sameSenderPrev ? <Avatar user={msg.sender} size={26} /> : null}
                      </span>
                    ) : null}

                    <div
                      className={cn(
                        "relative max-w-[80%] sm:max-w-[70%]",
                        own ? "text-right" : "text-left",
                      )}
                    >
                      {isGroup && !own && !sameSenderPrev ? <span className="mb-0.5 block px-2 text-[0.68rem] font-semibold text-[var(--accent-fg)]">{msg.sender.displayName}</span> : null}
                      {editingId === msg.id ? (
                        <div className="card-glass rounded-2xl p-2">
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void saveEdit(msg.id);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            rows={2}
                            autoFocus
                            className="field-input border-0! bg-transparent! p-2! text-sm"
                          />
                          <div className="flex justify-end gap-1.5 px-1 pb-1">
                            <button
                              type="button"
                              onClick={() => void saveEdit(msg.id)}
                              disabled={busyId === msg.id}
                              className="btn btn-primary px-2.5! py-1.5! text-xs!"
                            >
                              {busyId === msg.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="btn btn-ghost px-2.5! py-1! text-xs!"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            className={cn(
                              "inline-block max-w-full rounded-2xl px-3 py-2 text-left align-middle",
                              own
                                ? "rounded-br-md text-[var(--bubble-own-fg)]"
                                : "rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)]",
                              deleted && "opacity-70",
                            )}
                            style={
                              own
                                ? { background: "var(--bubble-own-bg)" }
                                : undefined
                            }
                          >
                            {msg.replyTo ? (
                              <button
                                type="button"
                                onClick={() => jumpTo(msg.replyTo!.id)}
                                className={cn(
                                  "mb-1.5 flex w-full items-start gap-2 rounded-lg border-l-2 py-1 pl-2 pr-1.5 text-left text-xs transition-opacity hover:opacity-75",
                                  own
                                    ? "border-[var(--accent-fg)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
                                    : "border-[var(--accent-fg)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
                                )}
                              >
                                <ReplyIcon className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
                                <span className="min-w-0">
                                  <span
                                    className={cn(
                                      "block font-semibold",
                                      own
                                        ? "text-[var(--bubble-own-fg)]"
                                        : "text-[var(--accent-fg)]",
                                    )}
                                  >
                                    {msg.replyTo.senderId === me.id
                                      ? "You"
                                      : msg.replyTo.senderName}
                                  </span>
                                  <span
                                    className={cn(
                                      "line-clamp-2 block",
                                      own
                                        ? "text-[var(--bubble-own-sub)]"
                                        : "text-[var(--muted)]",
                                      msg.replyTo.deleted && "italic",
                                    )}
                                  >
                                    {msg.replyTo.deleted
                                      ? "Message deleted"
                                      : msg.replyTo.text}
                                  </span>
                                </span>
                              </button>
                            ) : null}

                            {deleted ? (
                              <span className="flex items-center gap-1.5 text-sm italic opacity-80">
                                <Ban className="h-3.5 w-3.5" />
                                Message deleted
                              </span>
                            ) : (
                              <>
                                {msg.attachments.length > 0 ? (
                                  <div className={cn(msg.text && "mb-1.5")}>
                                    <AttachmentList
                                      attachments={msg.attachments}
                                      own={own}
                                    />
                                  </div>
                                ) : null}
                                {msg.text ? (
                                  <p className="whitespace-pre-wrap break-words text-[0.9rem] leading-relaxed">
                                    {msg.text}
                                  </p>
                                ) : null}
                              </>
                            )}

                            <span
                              className={cn(
                                "mt-0.5 flex items-center gap-1 text-[0.64rem]",
                                own
                                  ? "justify-end text-[var(--bubble-own-sub)]"
                                  : "text-[var(--muted)]",
                              )}
                            >
                              {msg.editedAt && !deleted ? "edited · " : ""}
                              {timeLabel(msg.createdAt)}
                              {msg.starred ? <Star className="h-3 w-3 fill-current text-[var(--accent-fg)]" /> : null}
                              {own && !deleted ? <ReceiptIcon message={msg} /> : null}
                            </span>
                          </div>

                          {msg.reactions.length > 0 ? (
                            <div
                              className={cn(
                                "mt-1 flex flex-wrap gap-1",
                                own ? "justify-end" : "justify-start",
                              )}
                            >
                              {msg.reactions.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(msg, r.emoji)}
                                  title={r.mine ? "Remove your reaction" : "React"}
                                  className={cn(
                                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-transform duration-150 hover:scale-105",
                                    r.mine
                                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-fg)]"
                                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
                                  )}
                                >
                                  <span>{r.emoji}</span>
                                  <span className="tabular-nums font-semibold">
                                    {r.count}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {pendingDelete?.id === msg.id ? (
                            <span
                              className={cn(
                                "absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-1",
                                own ? "-left-16" : "-right-16",
                              )}
                            >
                              <button
                                type="button"
                                aria-label="Confirm delete"
                                onClick={() => void executeDelete(pendingDelete!.id, pendingDelete!.mode)}
                                disabled={busyId === msg.id}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--danger)] text-white"
                              >
                                {busyId === msg.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel delete"
                                onClick={() => setPendingDelete(null)}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : (
                            <MessageActions
                              own={own}
                              deleted={deleted}
                              align={own ? "right" : "left"}
                              starred={msg.starred}
                              pinned={msg.pinned}
                              onReply={() => {
                                setReplyTo(msg);
                                composerRef.current?.focus();
                              }}
                              onReact={(emoji) => void toggleReaction(msg, emoji)}
                              onCopy={() => copyText(msg.text)}
                              onEdit={() => {
                                setEditingId(msg.id);
                                setEditDraft(msg.text);
                              }}
                              onStar={() => void toggleStar(msg)}
                              onUnstar={() => void toggleStar(msg)}
                              onPin={() => void togglePin(msg)}
                              onUnpin={() => void togglePin(msg)}
                              onDeleteForMe={() => {
                                void executeDelete(msg.id, "for_me");
                              }}
                              onDeleteForEveryone={() => setPendingDelete({ id: msg.id, mode: "for_everyone" })}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div aria-live="polite" aria-atomic="true">
          {otherTyping ? (
            <div className="mt-2 flex items-end gap-2 animate-msg-in">
              {other ? <Avatar user={other} size={26} /> : null}
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)] px-3 py-2.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:300ms]" />
                <span className="sr-only">{otherName} is typing</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ------------------------------ composer ------------------------------ */}
      <form
        onSubmit={send}
        className="flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:px-4"
      >
        {replyTo ? (
          <div className="mb-2 flex items-start gap-2.5 rounded-xl border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
            <ReplyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-[var(--accent-fg)]">
                Replying to{" "}
                {replyTo.senderId === me.id ? "yourself" : replyTo.sender.displayName}
              </span>
              <span className="line-clamp-1 block text-xs text-[var(--muted)]">
                {replyTo.deletedAt ? "Message deleted" : replyTo.text}
              </span>
            </span>
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={() => setReplyTo(null)}
              className="text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <AttachmentPreviews
          pending={attachments.pending}
          progress={attachments.progress}
          onRemove={attachments.removeFile}
          onCancel={attachments.cancel}
        />

        {mentionOptions.length ? <div className="mb-2 max-h-48 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-lg">{mentionOptions.map((member) => <button key={member.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertMention(member.username)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-[var(--surface-2)]"><Avatar user={member} size={28} /><span className="min-w-0"><b className="block truncate text-xs">{member.displayName}</b><small className="text-[var(--muted)]">@{member.username}</small></span></button>)}</div> : null}

        <div className="flex items-end gap-2">
          <AttachButton
            onFiles={(files) => attachments.addFiles(files)}
            disabled={sendPending || !requestAccepted}
          />
          <div className="flex-1 rounded-2xl bg-[var(--input-bg)] px-3.5">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                growComposer();
                if (e.target.value.trim()) noteTyping();
                else signalTyping(false);
              }}
              onBlur={() => signalTyping(false)}
              onKeyDown={onComposerKey}
              placeholder={requestAccepted ? "Message…" : "Accept this request to reply"}
              disabled={!requestAccepted}
              aria-label="Message text"
              rows={1}
              maxLength={2000}
              className="w-full resize-none bg-transparent py-2.5 text-[0.93rem] outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
            />
          </div>
          <button
            type="submit"
            disabled={
              !requestAccepted ||
              (!draft.trim() && attachments.pending.length === 0) ||
              sendPending
            }
            aria-label="Send message"
            className="btn btn-primary h-10 w-10 shrink-0 rounded-full! p-0!"
          >
            {sendPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
      </div>

      {/* Conversation details panel */}
      {showDetails ? (
        <ConversationDetails
          conversationId={conversationId}
          other={other}
          conversation={conversation}
          localRevision={galleryRevision}
          onClose={() => setShowDetails(false)}
        />
      ) : null}
    </div>
  );
}
