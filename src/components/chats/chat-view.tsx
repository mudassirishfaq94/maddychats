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
  Lock,
  Mic,
  Pin,
  Reply as ReplyIcon,
  SmilePlus,
  Star,
  Send,
  Clock,
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
  Copy,
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
import { ReportDialog } from "@/components/profile/report-dialog";
import { E2EEMediaProvider } from "./e2ee-context";
import { useE2EE } from "@/hooks/use-e2ee";
import {
  encryptBytes,
  exportSymmetricKey,
  generateConversationKey,
} from "@/lib/crypto";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const NEAR_BOTTOM_PX = 140;

function b64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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

  /* --------------------------- end-to-end encryption ---------------------- */

  const e2ee = useE2EE(me.id);
  const [e2eeState, setE2eeState] = useState<{
    ready: boolean;
    fingerprint: string | null;
    checking: boolean;
    peersMissingKeys: number;
  }>({ ready: false, fingerprint: null, checking: true, peersMissingKeys: 0 });
  const [showEncryptionInfo, setShowEncryptionInfo] = useState(false);
  const [decryptedTexts, setDecryptedTexts] = useState<Map<string, string>>(new Map());
  const [decryptedReplies, setDecryptedReplies] = useState<Map<string, string>>(new Map());
  const { prepareConversation, decrypt } = e2ee;

  // On open: fetch-or-create the conversation key, share it with every peer
  // device, and learn whether this chat can actually be E2EE right now.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Let cleanup cancel stale initialization before updating the status.
      await Promise.resolve();
      if (!alive) return;
      if (!e2ee.initialized) {
        setE2eeState((prev) => ({ ...prev, ready: false, checking: e2ee.loading }));
        return;
      }
      setE2eeState((prev) => ({ ...prev, ready: false, checking: true }));
      try {
        const { ready, fingerprint } = await prepareConversation(conversationId);
        if (!alive) return;
        let missing = 0;
        try {
          const res = await fetch(`/api/e2ee/peers?conversationId=${encodeURIComponent(conversationId)}`);
          if (res.ok) {
            const data = (await res.json()) as { peers?: { devices: unknown[] }[] };
            missing = (data.peers ?? []).filter((p) => p.devices.length === 0).length;
          }
        } catch {
          missing = 0;
        }
        if (!alive) return;
        setE2eeState({ ready, fingerprint, checking: false, peersMissingKeys: missing });
      } catch {
        if (alive) {
          setE2eeState({ ready: false, fingerprint: null, checking: false, peersMissingKeys: 0 });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [e2ee.initialized, e2ee.loading, conversationId, prepareConversation]);

  // Decrypt any encrypted message text (initial history, older pages, and
  // realtime arrivals all flow through `items`).
  // Failed decryptions are retried after a short delay — the peer's key
  // may still be in flight when the message first arrives.
  const failedDecryptionRef = useRef<Set<string>>(new Set());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!e2ee.initialized) return;
    const encItems = items.filter((m) => m.encrypted);
    if (encItems.length === 0) return;
    let alive = true;
    (async () => {
      const nextTexts = new Map(decryptedTexts);
      const nextReplies = new Map(decryptedReplies);
      let hadFailure = false;
      for (const m of encItems) {
        if (!nextTexts.has(m.id) && m.text) {
          try {
            nextTexts.set(m.id, await decrypt(m.text, conversationId));
            failedDecryptionRef.current.delete(m.id);
          } catch {
            // If this message previously failed, give up permanently.
            if (failedDecryptionRef.current.has(m.id)) {
              nextTexts.set(m.id, "\u{1F512} This message could not be decrypted on this device.");
            } else {
              failedDecryptionRef.current.add(m.id);
              hadFailure = true;
            }
          }
        }
        if (
          m.replyTo?.encrypted &&
          m.replyTo.text &&
          !nextReplies.has(m.replyTo.id)
        ) {
          try {
            nextReplies.set(m.replyTo.id, await decrypt(m.replyTo.text, conversationId));
          } catch {
            nextReplies.set(m.replyTo.id, "\u{1F512} Undecryptable");
          }
        }
      }
      if (!alive) return;
      if (nextTexts.size !== decryptedTexts.size) {
        setDecryptedTexts(nextTexts);
      }
      if (nextReplies.size !== decryptedReplies.size) {
        setDecryptedReplies(nextReplies);
      }
      // Retry failed decryptions after 2 seconds (peer's key may still arrive).
      if (hadFailure && alive) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          // Force re-run by bumping items via a no-op state update.
          setItems((prev) => [...prev]);
        }, 2000);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, e2ee.initialized, conversationId, decrypt]);

  /** Plaintext for a message: decrypted locally, or raw when not encrypted. */
  const textOf = useCallback((m: { encrypted: boolean; text: string; id: string }) => {
    if (!m.encrypted) return m.text;
    return decryptedTexts.get(m.id) ?? "";
  }, [decryptedTexts]);

  /** Safe text for clipboard/edit: never copy ciphertext. */
  const copyableText = useCallback((m: { encrypted: boolean; text: string; id: string }) => {
    if (!m.encrypted) return m.text;
    return decryptedTexts.get(m.id) ?? "";
  }, [decryptedTexts]);

  /** Pending = encrypted but not yet decrypted locally. */
  const isPendingDecrypt = useCallback(
    (m: { encrypted: boolean; id: string }) =>
      m.encrypted && decryptedTexts.get(m.id) === undefined,
    [decryptedTexts],
  );

  /** True when this conversation can send E2EE right now. */
  const canEncrypt = e2ee.initialized && e2eeState.ready;

  /** Encrypt a pending file into a ciphertext blob + conversation-wrapped key. */
  const encryptPendingFile = useCallback(
    async (file: File) => {
      const { key: conversationKey } = await e2ee.getConversationKey(conversationId);
      const mediaKey = await generateConversationKey();
      const mediaKeyB64 = await exportSymmetricKey(mediaKey);
      const cipherB64 = await encryptBytes(await file.arrayBuffer(), mediaKey);
      const wrappedKeyB64 = await encryptBytes(
        new TextEncoder().encode(mediaKeyB64),
        conversationKey,
      );
      const bytes = b64ToBytes(cipherB64);
      const cipherBuf = bytes.slice().buffer as ArrayBuffer;
      return {
        file: new File([cipherBuf], file.name, {
          type: "application/octet-stream",
        }),
        wrappedKey: wrappedKeyB64,
        originalMime: file.type || "application/octet-stream",
      };
    },
    [conversationId, e2ee],
  );

  const [showEmoji, setShowEmoji] = useState(false);
  const [mobileMenuMsg, setMobileMenuMsg] = useState<MessageDTO | null>(null);
  const [forwardMsg, setForwardMsg] = useState<MessageDTO | null>(null);
  const [reportMsg, setReportMsg] = useState<MessageDTO | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduledMessages, setScheduledMessages] = useState<Array<{ id: string; text: string; scheduledFor: string }>>([]);

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
        canEncrypt ? encryptPendingFile : undefined,
        canEncrypt
          ? (plain) => e2ee.encrypt(plain, conversationId)
          : undefined,
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
      // E2EE: plaintext never leaves this device — send AES-GCM ciphertext.
      const willEncrypt = canEncrypt;
      const payload = willEncrypt
        ? await e2ee.encrypt(text, conversationId)
        : text;
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: payload,
          replyToMessageId: replyTo?.id ?? null,
          encrypted: willEncrypt,
        }),
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
      // E2EE: encrypt the audio bytes before they reach the server.
      const willEncrypt = canEncrypt;
      if (willEncrypt) {
        const enc = await encryptPendingFile(file);
        form.append("encrypted", "true");
        form.append("files", enc.file, file.name);
        form.append("keys", enc.wrappedKey);
        form.append("origTypes", enc.originalMime);
      } else {
        form.append("files", file, file.name);
      }
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

  async function forwardMessage(targetConversationId: string) {
    if (!forwardMsg) return;
    // Decrypt the source locally, then re-encrypt for the target conversation
    // (keys are per-conversation, so ciphertext is never reused across chats).
    const plain = copyableText(forwardMsg);
    const prep = await e2ee.prepareConversation(targetConversationId);
    const willEncrypt = e2ee.initialized && prep.ready && plain.length > 0;
    const text = willEncrypt
      ? await e2ee.encrypt(plain, targetConversationId)
      : plain;
    const res = await fetch(`/api/conversations/${targetConversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text || forwardMsg.text || "",
        replyToMessageId: null,
        forwarded: true,
        encrypted: willEncrypt,
      }),
    });
    if (!res.ok) throw new Error("Forward failed");
  }

  async function scheduleSendMessage() {
    if (!draft.trim() || !scheduledTime) return;
    const scheduledFor = new Date(scheduledTime);
    if (scheduledFor <= new Date()) {
      setError("Scheduled time must be in the future.");
      return;
    }
    setSendPending(true);
    setError(null);
    try {
      const willEncrypt = canEncrypt;
      const payload = willEncrypt
        ? await e2ee.encrypt(draft.trim(), conversationId)
        : draft.trim();
      const res = await fetch(`/api/conversations/${conversationId}/scheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: payload,
          scheduledFor: scheduledFor.toISOString(),
          replyToMessageId: replyTo?.id ?? null,
          encrypted: willEncrypt,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to schedule message.");
      }
      setDraft("");
      setReplyTo(null);
      setShowSchedule(false);
      setScheduledTime("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendPending(false);
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
    <E2EEMediaProvider conversationId={conversationId} decryptMedia={e2ee.decryptMedia}>
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
                    : e2eeState.ready
                      ? "End-to-end encrypted"
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
          onClick={() => setShowEncryptionInfo(true)}
          aria-label={
            e2eeState.ready
              ? "End-to-end encryption is active. View details"
              : "Encryption status"
          }
          title={
            e2eeState.checking
              ? "Checking encryption…"
              : e2eeState.ready
                ? "End-to-end encrypted"
                : e2eeState.peersMissingKeys > 0
                  ? "Waiting for the other participant(s) to set up encryption"
                  : "Encryption unavailable"
          }
          className={cn(
            "flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-full px-2 transition-colors sm:px-2.5",
            e2eeState.ready
              ? "text-[var(--accent-fg)] hover:bg-[var(--accent-soft)]"
              : "text-[var(--muted)] hover:bg-[var(--surface-2)]",
          )}
        >
          {e2eeState.checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : e2eeState.ready ? (
            <Lock className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          <span className="hidden text-[0.62rem] font-bold uppercase tracking-wide md:inline">
            {e2eeState.ready ? "E2E" : "Sec"}
          </span>
        </button>

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

      {/* E2EE status banner — visible proof chats are encrypted */}
      {e2eeState.ready && requestAccepted ? (
        <button
          type="button"
          onClick={() => setShowEncryptionInfo(true)}
          className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] px-4 py-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]"
        >
          <Lock className="h-3 w-3 shrink-0 text-[var(--accent-fg)]" />
          <span className="min-w-0 flex-1 truncate text-[0.7rem] text-[var(--muted)]">
            Messages are end-to-end encrypted — only you and the recipient(s) can read them.
          </span>
          <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-wide text-[var(--accent-fg)]">
            Learn more
          </span>
        </button>
      ) : e2eeState.peersMissingKeys > 0 && !e2eeState.checking ? (
        <button
          type="button"
          onClick={() => setShowEncryptionInfo(true)}
          className="flex items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--warning,#f59e0b)_8%,var(--surface))] px-4 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
        >
          <ShieldCheck className="h-3 w-3 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 truncate text-[0.7rem] text-[var(--muted)]">
            Encryption is being set up — ask the other person to open ZipTalk once.
          </span>
          <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-wide text-amber-600">
            Details
          </span>
        </button>
      ) : null}

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

      {/* Group announcements */}
      {isGroup && conversation.announcements ? (
        <div className="mx-4 mt-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-fg)]">
            <span>📢</span>
            <span>Announcement</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{conversation.announcements}</p>
        </div>
      ) : null}

      {/* Group rules */}
      {isGroup && conversation.rules ? (
        <div className="mx-4 mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            <span>📋</span>
            <span>Group Rules</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted)]">{conversation.rules}</p>
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
              ? `Pinned message — ${
                  (firstPinned.encrypted
                    ? textOf(firstPinned) || "\u{1F512} Encrypted message"
                    : firstPinned.text
                  )
                    ? (firstPinned.encrypted
                        ? textOf(firstPinned) || "\u{1F512} Encrypted message"
                        : firstPinned.text
                      ).slice(0, 60)
                    : "Attachment"
                }`
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
            <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
              <span className="max-w-[18rem] text-[0.7rem] leading-relaxed text-[var(--muted)]">
                Messages in this chat are <b>end-to-end encrypted</b>. Only you and {otherName.split(" ")[0]} can read them.
              </span>
            </div>
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
                                        ) : msg.replyTo.encrypted && decryptedReplies.get(msg.replyTo.id) === undefined ? (
                                          <span className="flex items-center gap-1 opacity-70">
                                            <Lock className="inline h-3 w-3" />
                                            Decrypting…
                                          </span>
                                        ) : (
                                          <>
                                            <Quote className="mr-0.5 inline h-2.5 w-2.5 opacity-50" />
                                            {msg.replyTo.encrypted
                                              ? decryptedReplies.get(msg.replyTo.id) ?? ""
                                              : msg.replyTo.text}
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
                                      attachment={msg.attachments[0]}
                                      own={own}
                                      sender={msg.sender}
                                      duration={undefined}
                                      attachmentId={msg.attachments[0].id}
                                    />
                                  </div>
                                ) : msg.attachments.length > 0 ? (
                                  <div className={cn(textOf(msg) && "mb-1.5")}>
                                    <AttachmentList
                                      attachments={msg.attachments}
                                      own={own}
                                    />
                                  </div>
                                ) : null}
                                {msg.encrypted && isPendingDecrypt(msg) ? (
                                  <span className="flex items-center gap-1.5 text-[0.8rem] opacity-80">
                                    <Lock className="h-3 w-3" />
                                    {e2ee.error ? "Unable to decrypt on this device. Reload to try again." : "Decrypting securely…"}
                                  </span>
                                ) : textOf(msg) ? (
                                  (() => {
                                    const parsed = parseStatusReply(textOf(msg));
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
                                        {textOf(msg)}
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
                              {msg.encrypted ? (
                                <Lock className="h-2.5 w-2.5 opacity-60" aria-label="End-to-end encrypted" />
                              ) : null}
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
                              onCopy={() => {
                                const t = copyableText(msg);
                                if (t) copyText(t);
                              }}
                              onForward={() => setForwardMsg(msg)}
                              onReport={() => setReportMsg(msg)}
                              onEdit={() => {
                                if (isPendingDecrypt(msg)) return;
                                setEditingId(msg.id);
                                setEditDraft(copyableText(msg));
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
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)] px-3.5 py-3">
                <span className="typing-dot h-2 w-2 rounded-full bg-[var(--muted)]" style={{ animationDelay: "0ms" }} />
                <span className="typing-dot h-2 w-2 rounded-full bg-[var(--muted)]" style={{ animationDelay: "160ms" }} />
                <span className="typing-dot h-2 w-2 rounded-full bg-[var(--muted)]" style={{ animationDelay: "320ms" }} />
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
                {replyTo.deletedAt
                  ? "Message deleted"
                  : isPendingDecrypt(replyTo)
                    ? "\u{1F512} Decrypting…"
                    : copyableText(replyTo)}
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
            {recorder.state === "recording" || recorder.state === "paused" ? (
              <>
                <span className={cn("flex h-3 w-3 rounded-full bg-red-500", recorder.state === "recording" && "animate-pulse")} />
                <RecordingWaveform active={recorder.state === "recording"} height={24} className="min-w-0 flex-1" />
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatDuration(recorder.duration)}
                </span>
                <span className="hidden items-center gap-1 text-[0.65rem] font-medium text-[var(--muted)] sm:flex" title="Recording continues hands-free">
                  <Lock className="h-3 w-3" /> Hands-free
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
                  onClick={() => recorder.state === "recording" ? recorder.pauseRecording() : recorder.resumeRecording()}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]"
                  aria-label={recorder.state === "recording" ? "Pause recording" : "Resume recording"}
                >
                  {recorder.state === "recording" ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
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
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowSchedule(true)}
                  disabled={sendPending || !requestAccepted}
                  aria-label="Schedule message"
                  className="flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  title="Schedule message"
                >
                  <Clock className="h-4 w-4" />
                </button>
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
              </div>
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
        text={mobileMenuMsg ? copyableText(mobileMenuMsg) : ""}
        onCopy={() => {
          if (mobileMenuMsg) {
            const t = copyableText(mobileMenuMsg);
            if (t) copyText(t);
          }
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
        onReport={() => {
          if (mobileMenuMsg) {
            setReportMsg(mobileMenuMsg);
          }
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

      {/* Report dialog */}
      {reportMsg ? (
        <ReportDialog
          type="message"
          targetMessageId={reportMsg.id}
          targetUserId={reportMsg.senderId}
          targetName={reportMsg.sender.displayName}
          onClose={() => setReportMsg(null)}
        />
      ) : null}

      {/* Schedule message dialog */}
      {showSchedule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-glass w-full max-w-md rounded-3xl p-6 animate-fade-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-[var(--accent)]" />
                <h3 className="text-base font-bold">Schedule Message</h3>
              </div>
              <button type="button" onClick={() => { setShowSchedule(false); setScheduledTime(""); }} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">Send this message at a specific time:</p>
            <div className="mt-4">
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            {draft.trim() ? (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">Message</p>
                <p className="mt-1 line-clamp-3 text-sm">{draft.trim()}</p>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowSchedule(false); setScheduledTime(""); }} className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]">Cancel</button>
              <button
                type="button"
                onClick={() => void scheduleSendMessage()}
                disabled={!scheduledTime || !draft.trim() || sendPending}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {sendPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* End-to-end encryption info dialog */}
      {showEncryptionInfo ? (
        <EncryptionInfoDialog
          ready={e2eeState.ready}
          checking={e2eeState.checking}
          error={e2ee.error}
          fingerprint={e2eeState.fingerprint}
          peersMissing={e2eeState.peersMissingKeys}
          conversationName={otherName}
          onClose={() => setShowEncryptionInfo(false)}
        />
      ) : null}
      </div>
    </E2EEMediaProvider>
  );
}

/** Explains encryption status to the user; shows the verification fingerprint. */
function EncryptionInfoDialog({
  ready,
  checking,
  fingerprint,
  error,
  peersMissing,
  conversationName,
  onClose,
}: {
  ready: boolean;
  checking: boolean;
  fingerprint: string | null;
  error: string | null;
  peersMissing: number;
  conversationName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card-glass w-full max-w-md overflow-hidden rounded-3xl animate-fade-up">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]">
            {ready ? (
              <Lock className="h-5 w-5 text-[var(--accent-fg)]" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-[var(--muted)]" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold">End-to-end encryption</h3>
            <p className="text-xs text-[var(--muted)]">{conversationName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {checking ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking encryption keys…
            </div>
          ) : error ? (
            <p role="alert" className="py-6 text-sm text-[var(--muted)]">{error}</p>
          ) : ready ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-3.5 py-2.5">
                <Lock className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" />
                <p className="text-xs leading-relaxed">
                  Messages in this chat are <b>end-to-end encrypted</b>. ZipTalk and its servers cannot read them — only the devices in
                  this conversation hold the keys.
                </p>
              </div>

              {fingerprint ? (
                <div className="mt-4">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Verify the other person&apos;s device
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    Compare this code with {conversationName}&apos;s device in
                    person or over another secure channel. If they match, your
                    chat is secure against interception.
                  </p>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                    <code className="min-w-0 flex-1 select-all text-center font-mono text-sm font-semibold tracking-wider">
                      {fingerprint}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(fingerprint)
                          .then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          });
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] font-semibold text-[var(--accent-fg)] hover:bg-[var(--accent-soft)]"
                    >
                      {copied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              ) : null}

              <ul className="mt-4 space-y-2">
                <li className="flex items-start gap-2 text-xs text-[var(--muted)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  Text, voice and media are encrypted before they leave your device.
                </li>
                <li className="flex items-start gap-2 text-xs text-[var(--muted)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  No one in between — not even ZipTalk — can read the contents.
                </li>
                <li className="flex items-start gap-2 text-xs text-[var(--muted)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  Each conversation uses a unique key. Old keys are never reused.
                </li>
              </ul>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                End-to-end encryption needs every participant&apos;s device to
                generate a secure key. {peersMissing > 0
                  ? `We're still waiting for ${peersMissing} participant${peersMissing > 1 ? "s" : ""} to open ZipTalk once so their key can be created.`
                  : "Encryption keys are still being prepared."}
              </p>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                As soon as everyone&apos;s key is ready, all new messages in
                this chat are automatically end-to-end encrypted — you&apos;ll see
                the lock appear on every message.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary rounded-xl px-4 py-2 text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
