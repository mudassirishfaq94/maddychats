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
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  Info,
  Loader2,
  Mic,
  Pin,
  Reply as ReplyIcon,
  SmilePlus,
  Star,
  Send,
  ShieldCheck,
  StopCircle,
  Trash2,
  Users,
  X,
  Image as ImageIcon,
  Play,
  Pause,
  Type,
  MessageSquare,
  Quote,
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
import { cn, formatDate, timeAgo, initials, avatarHue } from "@/lib/utils";
import { getPattern } from "@/lib/chat-patterns";
import { EmojiPicker } from "./emoji-picker";
import { AudioMessage } from "./audio-message";
import { RecordingWaveform } from "./waveform";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { LongPressTouchable } from "./long-press-touchable";
import { MobileMessageMenu } from "./mobile-message-menu";
import { ForwardDialog } from "./forward-dialog";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hasPinnedMsgs, setHasPinnedMsgs] = useState(false);
  const [pinnedCount, setPinnedCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [otherTyping, setOtherTyping] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(!conversation.requestPending);
  const [acceptingRequest, setAcceptingRequest] = useState(false);
  const attachments = useAttachmentUpload();
  const recorder = useVoiceRecorder();
  const [showEmoji, setShowEmoji] = useState(false);
  const [mobileMenuMsg, setMobileMenuMsg] = useState<MessageDTO | null>(null);
  const [forwardMsg, setForwardMsg] = useState<MessageDTO | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [initialUnread, setInitialUnread] = useState<{ ids: Set<string>; count: number } | null>(null);
  const initialScrollDone = useRef(false);
  const unreadSnapshotTaken = useRef(false);
  const nodeRefs = useRef(new Map<string, HTMLDivElement | null>());
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftStorageReady = useRef(false);
  const draftStorageKey = `ziptalk:draft:${me.id}:${conversationId}`;

  const isGroup = conversation.type === "group";
  const otherName = isGroup ? conversation.name ?? "Group" : other?.displayName ?? "Unknown member";
  const otherPresence = other ? presence[other.id] : undefined;
  const otherOnline = Boolean(otherPresence?.online);
  const otherLastSeen = otherPresence?.lastSeenAt ?? other?.lastSeenAt ?? null;

  /* --------------------------- persistent drafts -------------------------- */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(draftStorageKey);
      if (saved) setDraft(saved.slice(0, 2000));
      draftStorageReady.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftStorageReady.current) return;
    const timer = window.setTimeout(() => {
      if (draft) window.localStorage.setItem(draftStorageKey, draft.slice(0, 2000));
      else window.localStorage.removeItem(draftStorageKey);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft, draftStorageKey]);

  /* ------------------------------ read receipts ----------------------------- */

  const markRead = useCallback(async () => {
    if (!requestAccepted) return;
    try {
      // The endpoint emits message:read when rows change; ChatsLayout then
      // performs one debounced refresh. Do not duplicate that request here.
      const response = await fetch(`/api/conversations/${conversationId}/read`, {
        method: "POST",
      });
      if (response.ok && !unreadSnapshotTaken.current) {
        const data = await response.json() as { readCount?: number; messageIds?: string[]; requestPending?: boolean };
        if (data.requestPending) return;
        unreadSnapshotTaken.current = true;
        const ids = Array.isArray(data.messageIds) ? data.messageIds : [];
        if (ids.length > 0) {
          setInitialUnread({ ids: new Set(ids), count: data.readCount ?? ids.length });
        }
      }
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
    const timer = window.setTimeout(() => void markRead(), 0);
    return () => window.clearTimeout(timer);
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
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = isNearBottom;
    setShowScrollDown(!isNearBottom);
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

  async function sendVoiceMessage() {
    if (!recorder.audioBlob || sendPending) return;
    setSendPending(true);
    setError(null);
    try {
      const ext = recorder.audioBlob.type.includes("webm") ? ".webm" : ".ogg";
      const file = new File([recorder.audioBlob], `voice${ext}`, {
        type: recorder.audioBlob.type,
      });
      const form = new FormData();
      form.append("conversationId", conversationId);
      form.append("files", file, file.name);
      if (replyTo?.id) form.append("replyToMessageId", replyTo.id);

      const res = await fetch("/api/upload/message", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => null)) as {
        message?: MessageDTO;
        error?: string;
      } | null;
      if (!res.ok || !data?.message) {
        setError(data?.error ?? "Voice message failed to send.");
        return;
      }
      const created = data.message;
      setItems((prev) =>
        prev.some((m) => m.id === created.id) ? prev : [...prev, created],
      );
      setReplyTo(null);
      recorder.clearRecording();
      nearBottomRef.current = true;
      scrollToBottom(true);
      router.refresh();
    } catch {
      setError("Network error. Voice message was not sent.");
    } finally {
      setSendPending(false);
    }
  }

  async function forwardMessage(conversationId: string) {
    if (!forwardMsg) return;
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: forwardMsg.text || "",
        replyToMessageId: null,
        forwarded: true,
      }),
    });
    if (!res.ok) throw new Error("Forward failed");
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

  /** Parse status reply messages and extract status context + reply text. */
  function parseStatusReply(text: string): { isStatusReply: boolean; statusType?: string; statusText?: string; replyText?: string } {
    const match = text.match(/^\[STATUS_REPLY:(\w+)\]([\s\S]*?)\[\/STATUS_REPLY\]\n([\s\S]*)$/);
    if (!match) return { isStatusReply: false };
    return {
      isStatusReply: true,
      statusType: match[1],
      statusText: match[2],
      replyText: match[3],
    };
  }

  /** Status type icon for inline display. */
  function StatusTypeIcon({ type, large }: { type: string; large?: boolean }) {
    const size = large ? "h-5 w-5" : "h-3.5 w-3.5";
    if (type === 'image') return <ImageIcon className={cn(size, "text-[#7c3aed]")} />;
    if (type === 'video') return <Play className={cn(size, "text-[#2563eb]")} />;
    return <MessageSquare className={cn(size, "text-[var(--accent-fg)]")} />;
  }

  /** Chat background styles. */
  /** Chat background styles. */
  const chatBackgrounds: Record<string, string> = {
    ocean: "linear-gradient(135deg, #0891b2, #1d4ed8)",
    forest: "linear-gradient(135deg, #15803d, #064e3b)",
    midnight: "linear-gradient(135deg, #111827, #312e81)",
    sunset: "linear-gradient(135deg, #ff6b6b, #7c3aed)",
    rose: "linear-gradient(135deg, #e11d48, #9333ea)",
    lavender: "linear-gradient(135deg, #a78bfa, #818cf8)",
    mint: "linear-gradient(135deg, #34d399, #06b6d4)",
  };

  const bgValue = conversation.backgroundStyle ?? null;
  const bgOpacity = (conversation.backgroundOpacity ?? 100) / 100;
  const isImageBg = bgValue && (
    bgValue.startsWith("http") ||
    bgValue.startsWith("data:image") ||
    /\.(jpg|jpeg|png|gif|webp|avif)/i.test(bgValue)
  );
  const isPatternBg = bgValue && !isImageBg && !chatBackgrounds[bgValue] &&
    bgValue !== "default" && !bgValue.startsWith("linear-gradient") && !bgValue.startsWith("radial-gradient") &&
    !bgValue.startsWith("#") && !bgValue.startsWith("rgb") && !bgValue.startsWith("hsl");

  let bgStyle: React.CSSProperties | undefined;
  if (bgValue && bgValue !== "default") {
    if (isImageBg) {
      // For images, use backgroundImage so it doesn't conflict with backgroundColor
      bgStyle = {
        backgroundImage: `url(${bgValue})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    } else if (isPatternBg) {
      // Pattern: use backgroundImage + backgroundColor (never shorthand `background`)
      const pat = getPattern(bgValue);
      if (pat) {
        bgStyle = {
          backgroundImage: `${pat.background(bgOpacity)} repeat`,
          backgroundColor: pat.baseColor,
        };
      }
    } else {
      // Gradient, color, or preset — gradients go in backgroundImage, solids in backgroundColor
      const resolved = chatBackgrounds[bgValue] ?? bgValue;
      if (resolved.startsWith("linear-gradient") || resolved.startsWith("radial-gradient")) {
        bgStyle = { backgroundImage: resolved, opacity: bgOpacity };
      } else {
        bgStyle = { backgroundColor: resolved, opacity: bgOpacity };
      }
    }
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

  const firstVisibleUnreadId = useMemo(
    () => visibleItems.find((message) => initialUnread?.ids.has(message.id))?.id ?? null,
    [initialUnread, visibleItems],
  );

  useEffect(() => {
    if (!firstVisibleUnreadId) return;
    const node = nodeRefs.current.get(firstVisibleUnreadId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [firstVisibleUnreadId]);

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
    <div className="flex h-full w-full min-w-0 overflow-hidden overflow-x-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* ------------------------------ header ------------------------------ */}
      <header className="flex h-14 min-w-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 sm:gap-3 sm:px-4">
        <Link
          href="/app/chats"
          aria-label="Back to chats"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)] lg:hidden"
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
            "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors",
            showDetails
              ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]"
              : "text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)]",
          )}
        >
          <Info className="h-5 w-5" />
        </button>

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
          "chat-message-area relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6",
          dragging && "outline-2 outline-dashed outline-offset-[-10px] outline-[var(--accent)]",
        )}
        style={bgStyle}
      >
        {isImageBg ? (
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background: `linear-gradient(to bottom, rgba(0,0,0,${0.3 * bgOpacity}), rgba(0,0,0,${0.5 * bgOpacity}))`,
            }}
          />
        ) : null}
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
          <div className="relative z-10 pb-4">
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
                  {msg.id === firstVisibleUnreadId ? (
                    <div className="my-4 flex items-center gap-3" role="separator" aria-label={`${initialUnread?.count ?? 0} unread messages`}>
                      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]" />
                      <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[0.68rem] font-semibold text-[var(--accent-fg)] shadow-sm">
                        {initialUnread?.count ?? 0} unread {initialUnread?.count === 1 ? "message" : "messages"}
                      </span>
                      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]" />
                    </div>
                  ) : null}
                  {showDate ? (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] px-3 py-1 text-[0.66rem] font-medium text-[var(--muted)]">
                        {dayLabel(msg.createdAt)}
                      </span>
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
                        "relative max-w-[85%] sm:max-w-[65%] md:max-w-[55%]",
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
                          <LongPressTouchable
                            onLongPress={() => {
                              if (!deleted) setMobileMenuMsg(msg);
                            }}
                          >
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
                            {msg.forwarded ? (
                              <span className="mb-1 block text-[0.6rem] font-medium italic text-[var(--muted)] opacity-70">
                                Forwarded
                              </span>
                            ) : null}
                            {msg.replyTo ? (
                              <button
                                type="button"
                                onClick={() => jumpTo(msg.replyTo!.id)}
                                className={cn(
                                  "group/reply mb-2 w-full overflow-hidden rounded-xl text-left text-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                                  own
                                    ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]"
                                    : "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
                                )}
                              >
                                <div className="flex items-stretch">
                                  <div
                                    className={cn(
                                      "w-1 shrink-0 rounded-full",
                                      own ? "bg-[var(--accent)]" : "bg-[var(--accent-fg)]",
                                    )}
                                  />
                                  <div className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2">
                                    <div className="relative mt-0.5 shrink-0">
                                      <span
                                        className="flex h-4 w-4 items-center justify-center rounded-full text-[0.5rem] font-bold text-white"
                                        style={{
                                          background: `linear-gradient(135deg, hsl(${avatarHue(msg.replyTo.senderId)} 48% 46%), hsl(${(avatarHue(msg.replyTo.senderId) + 40) % 360} 44% 52%))`,
                                        }}
                                      >
                                        {initials(
                                          msg.replyTo.senderId === me.id
                                            ? me.displayName
                                            : msg.replyTo.senderName,
                                        )}
                                      </span>
                                      <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--surface)] shadow-sm">
                                        <ReplyIcon className="h-2 w-2 text-[var(--muted)]" />
                                      </div>
                                    </div>
                                    <span className="min-w-0">
                                      <span className="flex items-center gap-1.5">
                                        <span
                                          className={cn(
                                            "text-[0.65rem] font-medium uppercase tracking-wider",
                                            own
                                              ? "text-[var(--bubble-own-sub)]"
                                              : "text-[var(--muted)]",
                                          )}
                                        >
                                          Reply
                                        </span>
                                        <span className="h-3 w-px bg-[var(--border)]" />
                                        <span
                                          className={cn(
                                            "truncate text-[0.72rem] font-semibold",
                                            own
                                              ? "text-[var(--bubble-own-fg)]"
                                              : "text-[var(--accent-fg)]",
                                          )}
                                        >
                                          {msg.replyTo.senderId === me.id
                                            ? "You"
                                            : msg.replyTo.senderName}
                                        </span>
                                      </span>
                                      <span
                                        className={cn(
                                          "mt-0.5 line-clamp-2 block text-[0.75rem] leading-relaxed",
                                          own
                                            ? "text-[var(--bubble-own-sub)]"
                                            : "text-[var(--muted)]",
                                          msg.replyTo.deleted && "italic opacity-60",
                                        )}
                                      >
                                        {msg.replyTo.deleted ? (
                                          <span className="flex items-center gap-1">
                                            <Ban className="inline h-3 w-3" />
                                            Message deleted
                                          </span>
                                        ) : (
                                          <>
                                            <Quote className="mr-0.5 inline h-2.5 w-2.5 opacity-50" />
                                            {msg.replyTo.text}
                                          </>
                                        )}
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ) : null}

                            {deleted ? (
                              <span className="flex items-center gap-1.5 text-sm italic opacity-80">
                                <Ban className="h-3.5 w-3.5" />
                                Message deleted
                              </span>
                            ) : (
                              <>
                                {msg.type === "audio" && msg.attachments.length > 0 ? (
                                  <div className="mb-1.5 min-w-[220px]">
                                    <AudioMessage
                                      src={msg.attachments[0].url}
                                      own={own}
                                      sender={msg.sender}
                                      duration={undefined}
                                    />
                                  </div>
                                ) : msg.attachments.length > 0 ? (
                                  <div className={cn(msg.text && "mb-1.5")}>
                                    <AttachmentList
                                      attachments={msg.attachments}
                                      own={own}
                                    />
                                  </div>
                                ) : null}
                                {msg.text ? (
                                  (() => {
                                    const parsed = parseStatusReply(msg.text);
                                    if (parsed.isStatusReply) {
                                      const statusGradients: Record<string, string> = {
                                        text: "linear-gradient(135deg, #0c8c7e22, #0c8c7e08)",
                                        image: "linear-gradient(135deg, #7c3aed22, #c026d308)",
                                        video: "linear-gradient(135deg, #2563eb22, #0891b208)",
                                      };
                                      const statusBorders: Record<string, string> = {
                                        text: "border-[var(--accent)]",
                                        image: "border-[#7c3aed]",
                                        video: "border-[#2563eb]",
                                      };
                                      const statusAccents: Record<string, string> = {
                                        text: "text-[var(--accent-fg)]",
                                        image: "text-[#7c3aed]",
                                        video: "text-[#2563eb]",
                                      };
                                      const statusGrad = statusGradients[parsed.statusType ?? 'text'] ?? statusGradients.text;
                                      const statusBorder = statusBorders[parsed.statusType ?? 'text'] ?? statusBorders.text;
                                      const statusAccent = statusAccents[parsed.statusType ?? 'text'] ?? statusAccents.text;
                                      return (
                                        <div className="space-y-2.5">
                                          <div
                                            className="overflow-hidden rounded-xl border-l-[3px] shadow-sm"
                                            style={{ borderColor: statusBorder.match(/#[a-f0-9]+/i)?.[0] ?? 'var(--accent)', background: statusGrad }}
                                          >
                                            <div className="flex items-start gap-3 px-3 py-2.5">
                                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] shadow-sm">
                                                <StatusTypeIcon type={parsed.statusType ?? 'text'} />
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest">
                                                    Status
                                                  </span>
                                                  <span className={cn("text-[0.65rem] font-medium", statusAccent)}>
                                                    {parsed.statusType === 'image' ? 'Photo' : parsed.statusType === 'video' ? 'Video' : 'Text'}
                                                  </span>
                                                </div>
                                                <p className="mt-1 text-[0.78rem] leading-relaxed text-[var(--muted)] line-clamp-2">
                                                  {parsed.statusText}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                          <p className="whitespace-pre-wrap break-words text-[0.9rem] leading-relaxed">
                                            {parsed.replyText}
                                          </p>
                                        </div>
                                      );
                                    }
                                    return (
                                      <p className="whitespace-pre-wrap break-words text-[0.9rem] leading-relaxed">
                                        {msg.text}
                                      </p>
                                    );
                                  })()
                                ) : null}
                              </>
                            )}

                            <span
                              className={cn(
                                "mt-0.5 flex items-center gap-0.5 text-[0.62rem] tabular-nums",
                                own
                                  ? "justify-end text-[var(--bubble-own-sub)]"
                                  : "text-[var(--muted)]",
                              )}
                            >
                              {msg.editedAt && !deleted ? (
                                <span className="text-[0.58rem] italic opacity-70">edited</span>
                              ) : null}
                              <span>{timeLabel(msg.createdAt)}</span>
                              {msg.starred ? <Star className="h-2.5 w-2.5 fill-current text-[var(--accent-fg)]" /> : null}
                              {own && !deleted ? <ReceiptIcon message={msg} /> : null}
                            </span>
                          </div>
                          </LongPressTouchable>

                          {msg.reactions.length > 0 ? (
                            <div
                              className={cn(
                                "mt-1 flex flex-wrap gap-0.5",
                                own ? "justify-end" : "justify-start",
                              )}
                            >
                              {msg.reactions.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(msg, r.emoji)}
                                  aria-label={`${r.emoji} reaction, ${r.count}${r.mine ? ", yours" : ""}`}
                                  className={cn(
                                    "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[0.7rem] transition-transform duration-150 hover:scale-105",
                                    r.mine
                                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-fg)]"
                                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
                                  )}
                                >
                                  <span className="leading-none">{r.emoji}</span>
                                  {r.count > 1 ? (
                                    <span className="tabular-nums font-semibold leading-none">
                                      {r.count}
                                    </span>
                                  ) : null}
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
                              onForward={() => setForwardMsg(msg)}
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

        {/* Scroll to bottom button */}
        {showScrollDown && (
          <div className="sticky bottom-2 z-20 flex justify-center pb-2">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              aria-label="Scroll to latest messages"
              className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] shadow-md transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Latest messages
            </button>
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
        onSubmit={(e) => {
          e.preventDefault();
          if (recorder.state === "recorded" && recorder.audioBlob) {
            void sendVoiceMessage();
          } else {
            void send(e);
          }
        }}
        className="flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] sm:px-4"
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

        {/* Voice recording UI */}
        {recorder.state !== "idle" ? (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-3">
            {recorder.state === "recording" ? (
              <>
                <span className="flex h-3 w-3 animate-pulse rounded-full bg-red-500" />
                <RecordingWaveform active height={24} className="min-w-0 flex-1" />
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatDuration(recorder.duration)}
                </span>
                <button
                  type="button"
                  onClick={() => recorder.cancelRecording()}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  aria-label="Cancel recording"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => recorder.stopRecording()}
                  className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-red-500 text-white transition-transform active:scale-95"
                  aria-label="Stop recording"
                >
                  <StopCircle className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                {/* Recorded — preview */}
                {recorder.audioUrl ? (
                  <div className="min-w-0 flex-1">
                    <AudioMessage
                      src={recorder.audioUrl}
                      own={true}
                      sender={me}
                      duration={recorder.duration}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => recorder.clearRecording()}
                  className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
                <button
                  type="submit"
                  disabled={sendPending}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-transform active:scale-95"
                  aria-label="Send voice message"
                >
                  {sendPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <AttachButton
              onFiles={(files) => attachments.addFiles(files)}
              disabled={sendPending || !requestAccepted}
            />

            {/* Emoji button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                aria-label="Emoji"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                <SmilePlus className="h-4.5 w-4.5" />
                <span className="sr-only">Emoji</span>
              </button>
              {showEmoji ? (
                <EmojiPicker
                  onSelect={(emoji) => {
                    setDraft((prev) => prev + emoji);
                    composerRef.current?.focus();
                  }}
                  onClose={() => setShowEmoji(false)}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 rounded-2xl bg-[var(--input-bg)] px-3.5">
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
            {draft.trim() || attachments.pending.length > 0 ? (
              <button
                type="submit"
                disabled={sendPending || !requestAccepted}
                aria-label="Send message"
                className="btn btn-primary h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 rounded-full! p-0!"
              >
                {sendPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={!requestAccepted}
                onClick={() => void recorder.startRecording()}
                aria-label="Record voice message"
                className="flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-50"
              >
                <Mic className="h-4.5 w-4.5" />
                <span className="sr-only">Record voice message</span>
              </button>
            )}
          </div>
        )}
        {recorder.error ? (
          <div className="mt-1.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2">
            <p className="whitespace-pre-line text-xs leading-relaxed text-[var(--danger)]">{recorder.error}</p>
            <button
              type="button"
              onClick={() => {
                recorder.clearRecording();
                void recorder.startRecording();
              }}
              className="mt-1.5 text-xs font-semibold text-[var(--danger)] underline underline-offset-2 hover:opacity-80"
            >
              Try again
            </button>
          </div>
        ) : null}
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

      {/* Mobile long-press context menu */}
      <MobileMessageMenu
        open={mobileMenuMsg !== null}
        onClose={() => setMobileMenuMsg(null)}
        own={mobileMenuMsg?.senderId === me.id}
        text={mobileMenuMsg?.text ?? ""}
        onCopy={() => {
          if (mobileMenuMsg) copyText(mobileMenuMsg.text);
        }}
        onReply={() => {
          if (mobileMenuMsg) {
            setReplyTo(mobileMenuMsg);
            composerRef.current?.focus();
          }
        }}
        onForward={() => {
          if (mobileMenuMsg) setForwardMsg(mobileMenuMsg);
        }}
        onReact={(emoji) => {
          if (mobileMenuMsg) void toggleReaction(mobileMenuMsg, emoji);
        }}
        onDeleteForMe={() => {
          if (mobileMenuMsg) void executeDelete(mobileMenuMsg.id, "for_me");
        }}
        onDeleteForEveryone={() => {
          if (mobileMenuMsg) setPendingDelete({ id: mobileMenuMsg.id, mode: "for_everyone" });
        }}
      />

      {/* Forward dialog */}
      <ForwardDialog
        open={forwardMsg !== null}
        message={forwardMsg}
        onClose={() => setForwardMsg(null)}
        onForward={forwardMessage}
      />
    </div>
  );
}
