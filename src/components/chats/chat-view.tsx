"use client";
import { forgetDecryptedAttachments } from "./e2ee-context";

import { useAudioCall } from "@/components/providers/audio-call-provider";
import Image from "next/image";
import { EncryptedMessageState } from "./encrypted-message-state";

const starterMode = process.env.NEXT_PUBLIC_STARTER_MODE === "1";
import { useCommittedRef } from "@/hooks/use-committed-ref";
import { useHydrated } from "@/hooks/use-hydrated";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type * as React from "react";
import {
  Settings,
  Phone,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  Loader2,
  Lock,
  Mic,
  Pin,
  Reply as ReplyIcon,
  Plus,
  Timer,
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
import { mergeRecentMessages } from "@/lib/chat-realtime-recovery";
import { recordApplicationTiming } from "@/components/performance-monitor";
import { Avatar } from "@/components/avatar";
import { useRealtime, usePresence } from "@/components/providers/realtime-provider";
import { VirtualMessageHistory, type MessageHistoryHandle } from "./virtual-message-history";
import { MessageActions } from "./message-actions";
const MessageSearch = dynamic(() => import("./message-search").then(module => module.MessageSearch));
import { ChatActionsMenu } from "./chat-actions-menu";
const AttachmentList = dynamic(() => import("./attachments").then((module) => module.AttachmentList));
const ConversationDetails = dynamic(() => import("./conversation-details").then((module) => module.ConversationDetails));
import {
  AttachButton,
  AttachmentPreviews,
  useAttachmentUpload,
} from "./attachment-composer";
import { emojiOnlyCount } from "@/lib/emoji";
import { splitMessageLinks } from "@/lib/message-links";
import { cn, formatDate, timeAgo, initials, avatarHue } from "@/lib/utils";
import { CHAT_BACKGROUNDS, chatBubbleTheme, isBackgroundImage } from "@/lib/chat-backgrounds";
import { getPattern } from "@/lib/chat-patterns";
const MediaPicker = dynamic(() => import("./media-picker").then((module) => module.MediaPicker));
const AudioMessage = dynamic(() => import("./audio-message").then((module) => module.AudioMessage));
const VoiceComposer = dynamic(() => import("./voice-composer").then((module) => module.VoiceComposer));
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { LongPressTouchable } from "./long-press-touchable";
const MobileMessageMenu = dynamic(() => import("./mobile-message-menu").then(module => module.MobileMessageMenu));
const ForwardDialog = dynamic(() => import("./forward-dialog").then(module => module.ForwardDialog));
import type { PeerVerification } from "./peer-verification-dialog";
const PeerVerificationDialog = dynamic(() => import("./peer-verification-dialog").then(module => module.PeerVerificationDialog));
const ReportDialog = dynamic(() => import("@/components/profile/report-dialog").then((module) => module.ReportDialog));
import { E2EEMediaProvider } from "./e2ee-context";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import {
  encryptBytes,
  exportSymmetricKey,
  generateConversationKey,
} from "@/lib/crypto";
import { mapWithConcurrency } from "@/lib/async";
import { chatPerf } from "@/lib/performance";
import { offlineHistoryRows } from "@/lib/offline-history";
import { optimizeImageForUpload } from "@/lib/optimize-image";
import { rememberHistory } from "../../../public/offline-store.js";
import { loadChatDraft, saveChatDraft, loadQueuedMessages, removeQueuedMessage, saveQueuedMessage } from "@/lib/chat-outbox";
import { claimQueuedSend } from "@/lib/queued-send-claim";

class SecureDeliveryWaiting extends Error {}

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

// Intl constructors are expensive inside every message render. Keep the UTC
// server/first-client representation, then use the browser's local timezone.
const utcTimeFormatter = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const localTimeFormatter = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false });
const utcDayFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function timeLabel(iso: string, hydrated: boolean): string {
  return (hydrated ? localTimeFormatter : utcTimeFormatter).format(new Date(iso));
}

function dayLabel(iso: string, hydrated: boolean): string {
  if (!hydrated) return utcDayFormatter.format(new Date(iso));
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatDate(iso);
}

function sameDay(a: string, b: string, hydrated: boolean): boolean {
  if (!hydrated) return a.slice(0, 10) === b.slice(0, 10);
  const da = new Date(a);
  const dbb = new Date(b);
  return (
    da.getFullYear() === dbb.getFullYear() &&
    da.getMonth() === dbb.getMonth() &&
    da.getDate() === dbb.getDate()
  );
}

/** Sent → Delivered → Read, with a WhatsApp-style tick and status label. */
function ReceiptIcon({ message }: { message: MessageDTO }) {
  if (message.sendStatus === "queued") {
    return <span aria-label="Queued" className="inline-flex items-center gap-1 text-[var(--bubble-own-sub)]"><Clock className="h-3 w-3" /><span className="text-[0.6rem]">Queued</span></span>;
  }
  if (message.sendStatus === "sending") {
    return (
      <span title="Sending" aria-label="Sending" className="inline-flex flex-col items-center leading-none text-[var(--bubble-own-sub)]">
        <Clock className="h-3.5 w-3.5" />
        <span className="mt-px text-[0.5rem] font-semibold">Sending</span>
      </span>
    );
  }
  if (message.sendStatus === "failed") {
    return (
      <span title="Failed to send" aria-label="Failed to send" className="inline-flex flex-col items-center leading-none text-red-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span className="mt-px text-[0.5rem] font-semibold">Failed</span>
      </span>
    );
  }
  if (message.readBy.length > 0) {
    return (
      <span title="Read" aria-label="Read" className="inline-flex flex-col items-center leading-none text-sky-400">
        <CheckCheck className="h-3.5 w-3.5 text-sky-400" />
        <span className="mt-px text-[0.5rem] font-semibold">Read</span>
      </span>
    );
  }
  if (message.deliveredAt) {
    return (
      <span title="Delivered" aria-label="Delivered" className="inline-flex flex-col items-center leading-none text-[var(--bubble-own-sub)]">
        <CheckCheck className="h-3.5 w-3.5 text-[var(--bubble-own-sub)]" />
        <span className="mt-px text-[0.5rem] font-semibold">Delivered</span>
      </span>
    );
  }
  return (
    <span title="Sent" aria-label="Sent" className="inline-flex flex-col items-center leading-none text-[var(--bubble-own-sub)]">
      <Check className="h-3.5 w-3.5 text-[var(--bubble-own-sub)]" />
      <span className="mt-px text-[0.5rem] font-semibold">Sent</span>
    </span>
  );
}

function queuedMessageHelp(reason?: string) {
  if (reason?.includes("This device needs approval")) return "Saved. On a linked phone, open Settings → Devices and approve this phone. It will send automatically.";
  if (reason?.includes("safety number") || reason?.includes("check number")) return "Saved. Compare the check number in this chat and approve the changed device. Your message will send after you approve it.";
  if (reason?.includes("No internet")) return "Saved. It will send automatically when you’re back online.";
  return "Saved. It will send automatically when secure chat setup is ready.";
}

function QueuedMessageNotice({ reason, onTry, onCancel }: { reason?: string; onTry: () => void; onCancel: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!visible) return <button type="button" className="mt-1 text-xs text-[var(--muted)] underline" aria-label="Show queued message options" onClick={() => setVisible(true)}>Queued · Options</button>;
  return <div role="status" className="mt-2 max-w-sm rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs leading-relaxed text-[var(--text)]">
    <p>{queuedMessageHelp(reason)}</p>
    <div className="mt-1 flex gap-3">
      <button type="button" className="underline" onClick={onTry}>Try now</button>
      <button type="button" className="underline" onClick={onCancel}>Cancel message</button>
      <span className="ml-auto text-[var(--muted)]" aria-label="This notice closes automatically">8 sec</span>
    </div>
  </div>;
}

export function ChatView({
  conversationId,
  me,
  other,
  conversation: serverConversation,
  initial,
}: {
  conversationId: string;
  me: SafeUser;
  other: PublicUser | null;
  conversation: ConversationDetail;
  initial: MessagePage;
}) {
  const [metadataUpdate, setMetadataUpdate] = useState<Partial<ConversationDetail> | null>(null);
  const conversation = metadataUpdate?.updatedAt && Date.parse(metadataUpdate.updatedAt) >= Date.parse(serverConversation.updatedAt)
    ? { ...serverConversation, ...metadataUpdate } : serverConversation;
  const hydrated = useHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const audioCall = useAudioCall();
  const { subscribe, connected } = useRealtime();
  const e2ee = useSharedE2EE();
  const {forgetDecryptedMessages}=e2ee;
  const encryptionRef = useRef<typeof e2ee | null>(null);
  useEffect(() => { encryptionRef.current = e2ee; }, [e2ee]);

  const [selfDestruct, setSelfDestruct] = useState(false);
  const selfDestructDraft = useRef(false);
  const serverClockOffset = useRef(initial.serverNow ? Date.parse(initial.serverNow)-Date.now() : 0);
  const [items, setItems] = useState<MessageDTO[]>(initial.messages);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // One timer for the nearest server deadline; foreground/resume also rechecks.
  useEffect(() => {
    const now = () => Date.now() + serverClockOffset.current;
    const due = items.filter(message => message.expiresAt && Date.parse(message.expiresAt) <= now() && (!message.selfDestruct || !message.deletedAt));
    const expiredReplies = new Set(items.flatMap(message=>message.replyTo?.expiresAt && !message.replyTo.deleted && Date.parse(message.replyTo.expiresAt)<=now() ? [message.replyTo.id] : []));
    const expire = () => {
      if (!due.length && !expiredReplies.size) return;
      const ids = new Set(due.map(message => message.id));
      forgetDecryptedMessages(conversationId,[...ids,...expiredReplies]);
      forgetDecryptedAttachments(due.flatMap(message=>message.attachments.map(attachment=>attachment.id)));
      setItems(current => current.map(message=>message.replyTo && expiredReplies.has(message.replyTo.id)?{...message,replyTo:{...message.replyTo,text:"",deleted:true}}:message).flatMap(message => !ids.has(message.id) ? [message] : message.selfDestruct ? [{ ...message, text: "", attachments: [], deletedAt: message.expiresAt }] : []));
      setDecryptedTexts(current => new Map([...current].filter(([id]) => !ids.has(id))));
      setDecryptedReplies(current => new Map([...current].filter(([id]) => !ids.has(id) && !expiredReplies.has(id))));
      setReplyTo(current => current && ids.has(current.id) ? null : current);
      setForwardMsg(current => current && ids.has(current.id) ? null : current);
      setMobileMenuMsg(current => current && ids.has(current.id) ? null : current);
      setEditingId(current => current && ids.has(current) ? null : current);
    };
    expire();
    const deadlines = [...items.filter(message => message.expiresAt && !message.deletedAt).map(message => Date.parse(message.expiresAt!)),...items.flatMap(message=>message.replyTo?.expiresAt && !message.replyTo.deleted ? [Date.parse(message.replyTo.expiresAt)] : [])];
    const delay = deadlines.length ? Math.max(0, Math.min(...deadlines) - now()) : null;
    const refresh = () => setItems(current => [...current]);
    const timer = delay !== null ? window.setTimeout(refresh, Math.min(delay + 1, 2147483647)) : null;
    document.addEventListener("visibilitychange", refresh);
    return () => { if (timer !== null) clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [items,conversationId,forgetDecryptedMessages]);
  async function revealMessage(message: MessageDTO) {
    try {
      const response = await fetch(`/api/messages/${message.id}/reveal`, { method: "POST", signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Couldn't show this message.");
      serverClockOffset.current = Date.parse(result.serverNow) - Date.now();
      setItems(current => current.map(item => item.id === message.id ? result.message : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't show this message."); }
  }
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendPending, setSendPendingState] = useState(false);
  const sendPendingRef = useRef(false);
  const setSendPending = useCallback((value: boolean) => {
    sendPendingRef.current = value;
    setSendPendingState(value);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [peerReview, setPeerReview] = useState<PeerVerification | null>(null);
  const [draft, setDraftState] = useState("");
  const draftRef = useRef("");
  const draftRevision = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerResizeFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (composerResizeFrame.current !== null) cancelAnimationFrame(composerResizeFrame.current);
  }, []);
  const draftPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (draftUpdateTimer.current) clearTimeout(draftUpdateTimer.current); }, []);
  const setDraft = useCallback((next: React.SetStateAction<string>) => {
    const value = typeof next === "function" ? next(draftRef.current) : next;
    if (draftUpdateTimer.current) clearTimeout(draftUpdateTimer.current);
    draftRevision.current++;
    draftRef.current = value;
    if (composerRef.current) composerRef.current.value = value;
    setDraftState(value);
  }, []);
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
  const [showHeaderSearch, setShowHeaderSearch] = useState(false);
  const [reportChat, setReportChat] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [otherTyping, setOtherTyping] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(!conversation.requestPending);
  const [awaitingApproval, setAwaitingApproval] = useState(Boolean(conversation.awaitingApproval));
  const requestSent = awaitingApproval && (conversation.introductionSent || items.some((message) => message.senderId === me.id && message.sendStatus !== "failed"));
  const [mediaPaused, setMediaPaused] = useState(starterMode);
  const [schedulePaused, setSchedulePaused] = useState(starterMode);
  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let fetching = false;
    const refresh = async () => {
      if (fetching || controller.signal.aborted) return;
      fetching = true;
      clearTimeout(retry);
      try {
        const response = await fetch("/api/chat-capabilities", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Capabilities unavailable");
        const capabilities = await response.json();
        if (typeof capabilities.media !== "boolean" || typeof capabilities.scheduled !== "boolean") throw new Error("Invalid capabilities");
        if (!controller.signal.aborted) {
          setMediaPaused(!capabilities.media);
          setSchedulePaused(!capabilities.scheduled);
          failures = 0;
        }
      } catch {
        if (!controller.signal.aborted && failures < 3) {
          failures += 1;
          retry = setTimeout(() => void refresh(), failures * 1000);
        }
      } finally { fetching = false; }
    };
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      clearTimeout(retry);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  const canCompose = requestAccepted && !requestSent;
  const [acceptingRequest, setAcceptingRequest] = useState(false);
  const attachments = useAttachmentUpload();
  const recorder = useVoiceRecorder();

  /* --------------------------- end-to-end encryption ---------------------- */

  const [e2eeState, setE2eeState] = useState<{
    ready: boolean;
    fingerprint: string | null;
    checking: boolean;
    peersMissingKeys: number;
    keyVersion: number;
    needsRotation: boolean;
    trustChanged: boolean;
  }>({ ready: false, fingerprint: null, checking: true, peersMissingKeys: 0, keyVersion: 1, needsRotation: false, trustChanged: false });
  const [showEncryptionInfo, setShowEncryptionInfo] = useState(false);
  const [encryptionNoticeFor, setEncryptionNoticeFor] = useState<string | null>(null);
  const encryptionNoticeKey = `circlo:e2ee-notice:v1:${me.id}:${conversationId}`;
  useEffect(() => {
    if (!requestAccepted || !e2eeState.ready || e2eeState.trustChanged || e2eeState.peersMissingKeys > 0) return;
    try {
      if (window.localStorage.getItem(encryptionNoticeKey)) return;
      window.localStorage.setItem(encryptionNoticeKey, "shown");
    } catch {
      // The notice is informational; storage being unavailable must not block chat use.
    }
    setEncryptionNoticeFor(encryptionNoticeKey);
  }, [encryptionNoticeKey, e2eeState.peersMissingKeys, e2eeState.ready, e2eeState.trustChanged, requestAccepted]);
  const [decryptedTexts, setDecryptedTexts] = useState<Map<string, string>>(() => new Map(
    initial.messages.flatMap((message) => {
      if (!message.encrypted) return [];
      const plaintext = e2ee.getCachedDecryptedMessage(conversationId, message.id, message.text);
      return plaintext === undefined ? [] : [[message.id, plaintext] as const];
    }),
  ));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void rememberHistory(me.id, conversationId, offlineHistoryRows(items, decryptedTexts, me.id, conversation.disappearingSeconds > 0 || conversation.requestPending || Boolean(conversation.awaitingApproval)), true).catch(() => {});
    }, 300);
    return () => window.clearTimeout(timer);
  }, [me.id, conversationId, items, decryptedTexts, conversation.disappearingSeconds, conversation.requestPending, conversation.awaitingApproval]);
  const [decryptedReplies, setDecryptedReplies] = useState<Map<string, string>>(new Map());
  const decryptedTextsRef = useRef(decryptedTexts);
  const decryptedRepliesRef = useRef(decryptedReplies);
  const { prepareConversation, decrypt, cacheDecryptedMessage, loadCachedDecryptedMessages } = e2ee;

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
        const rotationPromise = fetch(`/api/e2ee/key-rotation/status?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(e2ee.deviceId)}`)
          .then(async (response) => response.ok ? await response.json() as { needsRotation?: boolean; keyVersion?: number } : null)
          .catch(() => null);
        const { ready, fingerprint, trustChanged, missingPeers = 0 } = await prepareConversation(conversationId);
        if (!alive) return;
        // Check if key rotation is needed
        let needsRotation = false;
        let keyVersion = 1;
        const rotData = await rotationPromise;
        needsRotation = rotData?.needsRotation ?? false;
        keyVersion = rotData?.keyVersion ?? 1;

        if (!alive) return;
        setE2eeState({ ready, fingerprint, checking: false, peersMissingKeys: missingPeers, keyVersion, needsRotation, trustChanged: Boolean(trustChanged) });
      } catch {
        if (alive) {
          setE2eeState({ ready: false, fingerprint: null, checking: false, peersMissingKeys: 0, keyVersion: 1, needsRotation: false, trustChanged: false });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [e2ee.initialized, e2ee.loading, e2ee.deviceId, conversationId, me.id, prepareConversation]);

  // Decrypt any encrypted message text (initial history, older pages, and
  // realtime arrivals all flow through `items`).
  // Failed decryptions are retried after a short delay — the peer's key
  // may still be in flight when the message first arrives.
  const failedDecryptionRef = useRef<Map<string, number>>(new Map());
  const [unavailableMessageIds, setUnavailableMessageIds] = useState<Set<string>>(() => new Set());
  const missingMessageKeys = useRef(new Set<string>());
  const arrivalTimesRef = useRef<Map<string, number>>(new Map());
  const decryptingRef = useRef<Set<string>>(new Set());
  const decryptingRepliesRef = useRef<Set<string>>(new Set());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [decryptRetry, setDecryptRetry] = useState(0);
  const decryptConversationRef = useRef<string | null>(null);
  useEffect(() => {
    decryptConversationRef.current = conversationId;
    return () => { decryptConversationRef.current = null; };
  }, [conversationId]);
  useEffect(() => { decryptedTextsRef.current = decryptedTexts; }, [decryptedTexts]);
  useEffect(() => { decryptedRepliesRef.current = decryptedReplies; }, [decryptedReplies]);
  // Key reconciliation runs in the background. If it makes this chat's keys
  // available after the bounded initial decrypt retries, retry those rows
  // without requiring the user to refresh or tap each message.
  useEffect(() => {
    const retryAfterKeySync = (event: Event) => {
      const readyConversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (readyConversationId !== conversationId) return;
      // Include rows whose first decrypt is still in flight: the sync may
      // finish before their first failure is recorded.
      const retryIds = new Set(items.filter(message =>
        message.encrypted && message.text && message.text !== "signal:v2" && !decryptedTextsRef.current.has(message.id),
      ).map(message => message.id));
      if (retryIds.size === 0) return;
      for (const id of retryIds) {
        failedDecryptionRef.current.delete(id);
        missingMessageKeys.current.delete(id);
      }
      setUnavailableMessageIds(current => {
        if (![...retryIds].some(id => current.has(id))) return current;
        const next = new Set(current);
        for (const id of retryIds) next.delete(id);
        return next;
      });
      setDecryptRetry(value => value + 1);
    };
    window.addEventListener("maddy:message-keys-ready", retryAfterKeySync);
    return () => window.removeEventListener("maddy:message-keys-ready", retryAfterKeySync);
  }, [conversationId, items]);
  // Verified cache reads race normal local-key decryption; optional storage
  // must never hold fresh authorized history behind a full page scan.
  useEffect(() => {
    if (!e2ee.initialized) return;
    let alive = true;
    void loadCachedDecryptedMessages(conversationId, items.filter(message => !message.selfDestruct && !message.expiresAt && !message.deletedAt && !message.deletedForMe), (id, plaintext) => {
      if (alive) startTransition(() => setDecryptedTexts(current => current.get(id) === plaintext ? current : new Map(current).set(id, plaintext)));
    }).then((cached) => {
      if (alive && cached.size > 0) {
        setDecryptedTexts((current) => new Map([...current, ...cached]));
      }
    }).catch(() => { /* Optional cache never blocks normal decryption. */ });
    return () => { alive = false; };
  }, [conversationId, e2ee.initialized, items, loadCachedDecryptedMessages]);
  useEffect(() => {
    if (!e2ee.initialized) return;
    const bounds = scrollRef.current?.getBoundingClientRect();
    const visible = new Set([...nodeRefs.current].flatMap(([id, node]) => {
      const box = node?.getBoundingClientRect();
      return box && bounds && box.bottom >= bounds.top && box.top <= bounds.bottom ? [id] : [];
    }));
    const pending = items.filter(
      (m) =>
        m.encrypted &&
        m.text &&
        m.text !== "signal:v2" &&
        (failedDecryptionRef.current.get(m.id) ?? 0) < 2 &&
        !decryptedTextsRef.current.has(m.id) &&
        !decryptingRef.current.has(m.id),
    ).sort((a,b) => Number(visible.has(b.id)) - Number(visible.has(a.id)) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const pendingReplies = items.filter((m) =>
      m.replyTo?.encrypted && m.replyTo.text &&
      (failedDecryptionRef.current.get(`reply:${m.replyTo.id}`) ?? 0) < 2 &&
      !decryptedRepliesRef.current.has(m.replyTo.id) &&
      !decryptingRepliesRef.current.has(m.replyTo.id),
    );
    if (pending.length === 0 && pendingReplies.length === 0) return;
    let alive = true;
    let flushFrame: number | null = null;
    (async () => {
      let hadFailure = false;
      const messagesById = new Map(items.map(message => [message.id, message]));
      const textBatch = new Map<string, string>();
      const replyBatch = new Map<string, string>();
      const flushText = () => {
        if (flushFrame !== null) { cancelAnimationFrame(flushFrame); flushFrame = null; }
        if (!alive || textBatch.size === 0) return;
        const ready = new Map(textBatch); textBatch.clear();
        startTransition(() => setDecryptedTexts(current => new Map([...current, ...[...ready].filter(([id])=>{
          const message=messagesById.get(id);
          return message && (!message.expiresAt || Date.parse(message.expiresAt)>Date.now()+serverClockOffset.current);
        })])));
      };
      pending.forEach((m) => decryptingRef.current.add(m.id));
      pendingReplies.forEach((m) => decryptingRepliesRef.current.add(m.replyTo!.id));
      // RSA/AES work is CPU-heavy. Keep history rendering responsive instead
      // of starting a crypto operation for every message in a large page.
      await mapWithConcurrency(pending, 4, async (m) => {
        try {
          const plain = await decrypt(m.text, conversationId);
          failedDecryptionRef.current.delete(m.id);
          missingMessageKeys.current.delete(m.id);
          if (alive) setUnavailableMessageIds((current) => {
            if (!current.has(m.id)) return current;
            const next = new Set(current); next.delete(m.id); return next;
          });
          const arrivedAt = arrivalTimesRef.current.get(m.id);
          if (arrivedAt !== undefined) {
            chatPerf("recipient-event-to-decrypted", arrivedAt);
            arrivalTimesRef.current.delete(m.id);
          }
          if (m.expiresAt && Date.parse(m.expiresAt) <= Date.now() + serverClockOffset.current) return;
          if (!m.selfDestruct && !m.expiresAt) cacheDecryptedMessage(conversationId, m.id, m.text, plain);
          textBatch.set(m.id, plain);
          // Publish ready rows on the next frame; one slow/missing key must
          // never hold the first successes behind the rest of a history page.
          if (flushFrame === null) flushFrame = requestAnimationFrame(flushText);
        } catch (cause) {
          // A peer can still publish a just-created key, but retries must be
          // bounded so one legacy message never burns CPU forever.
          const attempts = (failedDecryptionRef.current.get(m.id) ?? 0) + 1;
          failedDecryptionRef.current.set(m.id, attempts);
          if (cause instanceof Error && cause.message === "This message's key is not available on this device") missingMessageKeys.current.add(m.id);
          else missingMessageKeys.current.delete(m.id);
          if (alive && attempts >= 2) setUnavailableMessageIds((current) => new Set(current).add(m.id));
          hadFailure ||= attempts < 2;
        } finally {
          decryptingRef.current.delete(m.id);
        }
      });
      flushText();
      await mapWithConcurrency(pendingReplies, 4, async (m) => {
        const reply = m.replyTo!;
        try {
          const plain = await decrypt(reply.text, conversationId);
          failedDecryptionRef.current.delete(`reply:${reply.id}`);
          if (!reply.expiresAt || Date.parse(reply.expiresAt)>Date.now()+serverClockOffset.current) replyBatch.set(reply.id, plain);
        } catch {
          const key = `reply:${reply.id}`;
          const attempts = (failedDecryptionRef.current.get(key) ?? 0) + 1;
          failedDecryptionRef.current.set(key, attempts);
          hadFailure ||= attempts < 2;
          if (alive && attempts >= 2) setUnavailableMessageIds(current => new Set(current).add(key));
        } finally {
          decryptingRepliesRef.current.delete(reply.id);
        }
      });
      if (!alive) {
        // A read receipt/history refresh can replace items during WebCrypto.
        // The replacement effect skips those in-flight IDs; wake it when this
        // batch releases them instead of leaving a permanent loading bubble.
        if (decryptConversationRef.current === conversationId) setDecryptRetry(value => value + 1);
        return;
      }
      if (replyBatch.size) startTransition(() => setDecryptedReplies(current => new Map([...current, ...replyBatch])));
      // Retry once for a key that may still be in flight, then surface a
      // concise per-message fallback without blocking the rest of the chat.
      if (hadFailure && alive) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          setDecryptRetry((value) => value + 1);
        }, 1000);
      }
    })();
    return () => {
      alive = false;
      if (flushFrame !== null) cancelAnimationFrame(flushFrame);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [items, e2ee.initialized, conversationId, decrypt, decryptRetry, cacheDecryptedMessage]);

  /** Plaintext for a message: decrypted locally, or raw when not encrypted. */
  const textOf = useCallback((m: { encrypted: boolean; text: string; id: string }) => {
    if (!m.encrypted) return m.text;
    if (m.text === "signal:v2") return "Loading…";
    return decryptedTexts.get(m.id)
      ?? (conversation.type === "dm" && conversation.requestInitiatorId !== me.id && items.length === 1
        ? "Waiting for them to open Circlo…" : undefined)
      ?? (unavailableMessageIds.has(m.id)
        ? "Couldn't load"
        : "");
  }, [decryptedTexts, unavailableMessageIds, conversation.type, conversation.requestInitiatorId, me.id, items.length]);

  /** Safe text for clipboard/edit: never copy ciphertext. */
  const copyableText = useCallback((m: { encrypted: boolean; text: string; id: string }) => {
    if (!m.encrypted) return m.text;
    return decryptedTexts.get(m.id) ?? "";
  }, [decryptedTexts]);

  /** Pending = encrypted but not yet decrypted locally. */
  const isPendingDecrypt = useCallback(
    (m: { encrypted: boolean; text: string; id: string }) =>
      m.encrypted &&
      m.text !== "signal:v2" &&
      Boolean(m.text) &&
      decryptedTexts.get(m.id) === undefined,
    [decryptedTexts],
  );

  /** Re-check key delivery immediately before a mutation. Encryption status
   * can change while a chat remains open, so the initial UI snapshot is not
   * a safe basis for deciding whether plaintext may leave the device. */
  const prepareEncryptedSend = useCallback(async (allowMessageRequest = false) => {
    if (!navigator.onLine) throw new SecureDeliveryWaiting("No internet. This will send when you're back online.");
    // A fast first keystroke/send can beat local key restoration on navigation.
    // Keep the optimistic message and draft while setup finishes, with a bound
    // so a failed initialization cannot leave the sending spinner running.
    for (let attempt = 0; attempt < 300 && (!encryptionRef.current || (!encryptionRef.current.initialized && encryptionRef.current.loading)); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const encryption = encryptionRef.current;
    if (!encryption) throw new SecureDeliveryWaiting("Still setting up. This will send by itself in a moment.");
    if (!encryption.initialized) {
      throw new SecureDeliveryWaiting(encryption.loading
        ? "Taking longer than expected. Your draft is saved — tap send again."
        : encryption.error ?? "Can't send securely right now. Your draft is saved.");
    }
    // Refresh approved recipients before encryption. Group roster/device changes
    // establish a fresh sending key; the initial bootstrap remains serialized.
    const prepared = await encryption.prepareConversation(conversationId, { allowMessageRequest });
    setE2eeState((previous) => ({
      ...previous,
      ready: prepared.ready && !prepared.missingPeers,
      fingerprint: prepared.fingerprint,
      checking: false,
      trustChanged: Boolean(prepared.trustChanged),
    }));
    if (!prepared.ready) {
      throw new SecureDeliveryWaiting(prepared.trustChanged
        ? "Someone in this chat changed phones. Compare their check number before sending."
        : encryptionRef.current?.error ?? "Waiting for secure delivery. Your message will send automatically when encryption is ready.");
    }
  }, [conversationId]);

  /** Encrypt a pending file into a ciphertext blob + conversation-wrapped key. */
  const encryptPendingFile = useCallback(
    async (file: File) => {
      const uploadFile = await optimizeImageForUpload(file);
      const { key: conversationKey } = await e2ee.getConversationKey(conversationId, { waitForPeer: true });
      const mediaKey = await generateConversationKey();
      const mediaKeyB64 = await exportSymmetricKey(mediaKey);
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},mediaKey,await uploadFile.arrayBuffer());
      const wrappedKeyB64 = await encryptBytes(
        new TextEncoder().encode(mediaKeyB64),
        conversationKey,
      );
      return {
        file: new File([iv,ciphertext], uploadFile.name, {
          type: "application/octet-stream",
        }),
        wrappedKey: wrappedKeyB64,
        originalMime: uploadFile.type || "application/octet-stream",
        originalName: uploadFile.name,
      };
    },
    [conversationId, e2ee],
  );

  const [showEmoji, setShowEmoji] = useState(false);
  const mediaPickerAnchor = useRef<HTMLButtonElement>(null);
  const [mobileMenuMsg, setMobileMenuMsg] = useState<MessageDTO | null>(null);
  const [forwardMsg, setForwardMsg] = useState<MessageDTO | null>(null);
  const [reportMsg, setReportMsg] = useState<MessageDTO | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const attachScrollElement = useCallback((node: HTMLDivElement | null) => { scrollRef.current = node; setScrollElement(node); }, []);
  const historyRef = useRef<MessageHistoryHandle | null>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const touchScrollY = useRef(0);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [initialUnread, setInitialUnread] = useState<{ ids: Set<string>; count: number } | null>(null);
  const initialScrollDone = useRef(false);
  const unreadSnapshotTaken = useRef(false);
  const nodeRefs = useRef(new Map<string, HTMLDivElement | null>());
  const chatMountedAt = useRef(performance.now());
  const firstReadableRecorded = useRef(false);
  useEffect(() => {
    if (firstReadableRecorded.current) return;
    const bounds = scrollRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const readable = items.some(message => {
      if (message.deletedAt || message.deletedForMe || message.selfDestruct || message.expiresAt) return false;
      if (message.encrypted && !decryptedTexts.has(message.id)) return false;
      const node = nodeRefs.current.get(message.id);
      const box = node?.getBoundingClientRect();
      return Boolean(box && box.bottom >= bounds.top && box.top <= bounds.bottom);
    });
    if (readable) {
      firstReadableRecorded.current = true;
      recordApplicationTiming("first-readable-message", performance.now() - chatMountedAt.current);
    }
  }, [items, decryptedTexts]);
  const typingActiveRef = useRef(false);
  const lastTypingSentRef = useRef(0);
  const remoteTypersRef = useRef(new Map<string, number>());
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftStorageReady = useRef(false);
  const draftStorageKey = `ziptalk:draft:${me.id}:${conversationId}`;

  const isGroup = conversation.type === "group";
  const otherName = isGroup ? conversation.name ?? "Group" : other?.displayName ?? "Unknown member";
  const otherPresence = usePresence(other?.id);
  const otherOnline = Boolean(otherPresence?.online);
  const otherLastSeen = otherPresence?.lastSeenAt ?? other?.lastSeenAt ?? null;

  /* --------------------------- persistent drafts -------------------------- */

  const persistDraft = useCallback(() => {
    if (!draftStorageReady.current || selfDestructDraft.current) return;
    void saveChatDraft(me.id, conversationId, draftRef.current).catch(() => {});
  }, [me.id, conversationId]);
  const queueDraftPersistence = useCallback(() => {
    if (draftPersistTimer.current) clearTimeout(draftPersistTimer.current);
    draftPersistTimer.current = setTimeout(persistDraft, 180);
  }, [persistDraft]);
  useEffect(() => {
    draftStorageReady.current = false;
    let disposed = false;
    const initialRevision = draftRevision.current;
    void (async () => {
      try {
        let saved = await loadChatDraft(me.id, conversationId);
        const legacy = window.localStorage.getItem(draftStorageKey);
        if (saved === null && legacy) saved = legacy;
        if (!disposed && saved && !draftRef.current && draftRevision.current === initialRevision) setDraft(saved);
        // Remove the old plaintext entry only after durable encryption succeeds.
        if (legacy && !disposed && !selfDestructDraft.current) {
          await saveChatDraft(me.id, conversationId, draftRef.current);
          window.localStorage.removeItem(draftStorageKey);
        }
      } catch { /* Keep current input and any unmigrated legacy draft. */ }
      finally { if (!disposed) { draftStorageReady.current = true; queueDraftPersistence(); } }
    })();
    const background = () => { if (document.visibilityState === "hidden") persistDraft(); };
    window.addEventListener("pagehide", persistDraft);
    document.addEventListener("visibilitychange", background);
    return () => {
      disposed = true;
      if (draftPersistTimer.current) clearTimeout(draftPersistTimer.current);
      window.removeEventListener("pagehide", persistDraft);
      document.removeEventListener("visibilitychange", background);
      persistDraft();
    };
  }, [me.id, conversationId, draftStorageKey, setDraft, persistDraft, queueDraftPersistence]);
  useEffect(() => { queueDraftPersistence(); }, [draft, queueDraftPersistence]);

  // Retire the encrypted draft before exposing an empty composer. A fast
  // reload must not read an older save that was still encrypting at delivery.
  async function clearDeliveredDraft(expected: string, trimmed = false) {
    if ((trimmed ? draftRef.current.trim() : draftRef.current) !== expected) return;
    const revision = ++draftRevision.current;
    draftRef.current = "";
    if (draftUpdateTimer.current) clearTimeout(draftUpdateTimer.current);
    if (draftPersistTimer.current) clearTimeout(draftPersistTimer.current);
    if (composerRef.current) composerRef.current.value = "";
    setDraftState("");
    await saveChatDraft(me.id, conversationId, "").catch(() => undefined);
    // Preserve anything the user typed while IndexedDB was finishing.
    if (draftRevision.current !== revision) {
      await saveChatDraft(me.id, conversationId, draftRef.current).catch(() => undefined);
      return;
    }
    setReplyTo(null); selfDestructDraft.current=false; setSelfDestruct(false);
  }

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

  const reconcileRecentMessages = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return false;
    const page = await response.json() as MessagePage;
    if (signal?.aborted || !Array.isArray(page.messages)) return false;

    const current = itemsRef.current;
    const merged = mergeRecentMessages(current, page.messages, conversationId);
    setItems(previous => mergeRecentMessages(previous, page.messages, conversationId));
    if (merged !== current && document.visibilityState === "visible") void markRead();
    return merged !== current;
  }, [conversationId, markRead]);

  async function acceptMessageRequest() {
    setAcceptingRequest(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/accept`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Couldn't accept this request.");
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

  // A message can commit after the SSR history query but before SSE starts.
  // Its initial replay window is only one second. Reconcile once per stream
  // connection, without polling, replacing drafts, or dropping older pages.
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    void (async () => {
      try {
        await reconcileRecentMessages(controller.signal);
      } catch { /* A reconnect retries; cached private history is never used. */ }
      finally { window.clearTimeout(timeout); }
    })();
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [connected, conversationId, me.id, reconcileRecentMessages]);

  // Mobile WebViews can temporarily lose DNS/network access while EventSource
  // is reconnecting. Keep the visible chat current with bounded authenticated
  // history reads until SSE recovers; never poll in the background or overlap
  // requests. SSE remains the primary realtime transport.
  useEffect(() => {
    if (connected || !requestAccepted) return;

    const retryDelays = [1500, 3000, 7000, 15000, 30000] as const;
    let retryIndex = 0;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let stopped = false;
    let inFlight = false;

    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (delay: number) => {
      clearTimer();
      if (stopped || connected || document.visibilityState !== "visible" || !navigator.onLine) return;
      timer = window.setTimeout(() => { void catchUp(); }, delay);
    };
    const catchUp = async () => {
      if (stopped || connected || inFlight || document.visibilityState !== "visible" || !navigator.onLine) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const foundNewMessages = await reconcileRecentMessages(controller.signal);
        if (stopped || controller.signal.aborted) return;
        if (foundNewMessages) {
          retryIndex = 0;
        } else {
          retryIndex = Math.min(retryIndex + 1, retryDelays.length - 1);
        }
      } catch {
        retryIndex = Math.min(retryIndex + 1, retryDelays.length - 1);
      } finally {
        window.clearTimeout(timeout);
        controller = undefined;
        inFlight = false;
        schedule(retryDelays[retryIndex]);
      }
    };
    const resume = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        retryIndex = 0;
        schedule(0);
      } else {
        clearTimer();
        controller?.abort();
      }
    };

    schedule(retryDelays[retryIndex]);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      stopped = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [connected, conversationId, me.id, reconcileRecentMessages, requestAccepted]);

  /* ---------------------------- typing state ----------------------------- */

  const signalTyping = useCallback(
    (typing: boolean) => {
      if (typingActiveRef.current === typing && (!typing || Date.now() - lastTypingSentRef.current < 2000)) return;
      typingActiveRef.current = typing;
      lastTypingSentRef.current = Date.now();
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
      if (event.type === "message:lifetime" && event.conversationId === conversationId) {
        if(event.serverNow) serverClockOffset.current=Date.parse(event.serverNow)-Date.now();
        setItems(current => current.map(message => message.id === event.messageId ? { ...message, expiresAt: event.expiresAt, revealedAt: event.revealedAt ?? message.revealedAt } : message));
        return;
      }
      if (event.type === "realtime:resync") {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        void reconcileRecentMessages(controller.signal).catch(() => undefined).finally(() => window.clearTimeout(timeout));
        return;
      }
      if (event.type === "typing:update" && event.conversationId === conversationId && event.userId !== me.id) {
        // The stream rejects expired events with its server clock. Use a
        // relative local timer so clock skew on a phone cannot hide typing.
        if (!Number.isFinite(Date.parse(event.expiresAt))) return;
        const typers = remoteTypersRef.current;
        if (event.typing) typers.set(event.userId, Date.now() + 5000);
        else typers.delete(event.userId);
        const expire = () => {
          const now = Date.now();
          for (const [id, until] of typers) if (until <= now) typers.delete(id);
          setOtherTyping(typers.size > 0);
          if (typers.size) remoteTypingTimerRef.current = setTimeout(expire, Math.max(1, Math.min(...typers.values()) - now));
        };
        if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
        expire();
        return;
      }
      if ((event.type === "group:updated" || event.type === "group:member-added" || event.type === "group:member-removed" || event.type === "group:member-updated") && event.conversationId === conversationId) {
        router.refresh();
        return;
      }
      if (event.type === "conversation:accepted" && event.conversationId === conversationId) {
        setAwaitingApproval(false);
        setRequestAccepted(true);
        router.refresh();
        return;
      }
      if (event.type === "conversation:keys-shared" && event.conversationId === conversationId) {
        failedDecryptionRef.current.clear();
        setUnavailableMessageIds(new Set());
        setDecryptRetry((value) => value + 1);
        window.dispatchEvent(new Event("maddy:message-request-keys"));
        return;
      }
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
        const arrivalStarted = performance.now();
        if (msg.encrypted) arrivalTimesRef.current.set(msg.id, arrivalStarted);
        setItems((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const optimisticIndex = msg.clientMessageId
            ? prev.findIndex((m) => m.clientMessageId === msg.clientMessageId)
            : -1;
          if (optimisticIndex < 0) return [...prev, msg];
          const optimistic = prev[optimisticIndex];
          setDecryptedTexts((texts) => {
            const plain = texts.get(optimistic.id);
            if (plain === undefined) return texts;
            const next = new Map(texts);
            next.delete(optimistic.id);
            next.set(msg.id, plain);
            return next;
          });
          const next = [...prev];
          next[optimisticIndex] = { ...msg, sendStatus: "sent" };
          return next;
        });
        requestAnimationFrame(() => chatPerf("recipient-event-to-render", arrivalStarted));
        if (msg.senderId !== me.id && document.visibilityState === "visible") {
          void markRead();
        }
      } else {
        if (event.type === "message:update") {
          setDecryptedTexts(previous => { const next = new Map(previous); next.delete(msg.id); return next; });
          failedDecryptionRef.current.delete(msg.id);
          setUnavailableMessageIds((current) => {
            if (!current.has(msg.id)) return current;
            const next = new Set(current); next.delete(msg.id); return next;
          });
        }
        setItems((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
    });
  }, [subscribe, conversationId, router, me.id, markRead, reconcileRecentMessages]);

  /* ----------------------------- scroll helpers ---------------------------- */

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    followLatestRef.current = true;
    if (historyRef.current) historyRef.current.scrollToEnd(smooth);
    else el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      followLatestRef.current = !searchParams.get("message") || !items.some(item => item.id === searchParams.get("message"));
      if (followLatestRef.current) scrollToBottom(false);
    }
  }, [scrollToBottom, searchParams, items]);

  const hasMessages = items.length > 0;
  useEffect(() => {
    const viewport = scrollRef.current, content = messageContentRef.current;
    if (!viewport || !content) return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!followLatestRef.current || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (followLatestRef.current) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
      });
    });
    // Decryption, images and content-visibility change row heights after mount.
    observer.observe(content); observer.observe(viewport);
    return () => { observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [conversationId, hasMessages]);

  // System-notification taps always arrive at the current end of the chat.
  useEffect(() => {
    if (searchParams.get("latest") !== "1") return;
    requestAnimationFrame(() => scrollToBottom(false));
  }, [scrollToBottom, searchParams]);

  const lastIdRef = useRef<string | null>(null);
  const lastSendStateRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const last = items[items.length - 1];
    if (!last || searchParams.get("message")) return;
    const previousId = lastIdRef.current;
    const isNewMessage = previousId !== null && last.id !== previousId;
    if (last.id === previousId && last.sendStatus === lastSendStateRef.current) return;
    lastIdRef.current = last.id;
    lastSendStateRef.current = last.sendStatus;
    if ((isNewMessage && last.senderId === me.id) || followLatestRef.current) {
      requestAnimationFrame(() => { if ((isNewMessage && last.senderId === me.id) || followLatestRef.current) scrollToBottom(true); });
    }
  }, [items, me.id, scrollToBottom, searchParams]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 2) followLatestRef.current = true;
    nearBottomRef.current = isNearBottom;
    setShowScrollDown(!isNearBottom);
  }

  function jumpTo(messageId: string) {
    const node = nodeRefs.current.get(messageId);
    if (!node && !historyRef.current?.scrollToMessage(messageId)) {
      setError("That message is further back — load older messages to see it.");
      return;
    }
    followLatestRef.current = false;
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId(null), 1600);
  }

  // Deep link (?message=<id>) locates the target message.
  const targetMessageId = searchParams.get("message");
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!targetMessageId || jumpedRef.current === targetMessageId) return;
    const node = nodeRefs.current.get(targetMessageId);
    if (!node && !historyRef.current?.scrollToMessage(targetMessageId)) return;
    jumpedRef.current = targetMessageId;
    followLatestRef.current = false;
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(targetMessageId);
    setTimeout(() => setHighlightId(null), 2200);
  }, [targetMessageId, items]);

  /* --------------------------- pagination (older) -------------------------- */

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || !nextCursor) return;
    followLatestRef.current = false;
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
        setError(data?.error ?? "Couldn't load older messages.");
        return;
      }
      setItems((prev) => [...data.messages, ...prev]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      requestAnimationFrame(() => {
        const node = scrollRef.current;
        if (node && !historyRef.current?.managesAnchoring) node.scrollTop = node.scrollHeight - prevHeight + prevTop;
      });
    } catch {
      setError("Couldn't load older messages. Check your connection.");
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
    if (!canCompose) return;
    const sendStarted = performance.now();
    // Read the immediate draft, including a last keystroke whose background
    // UI update has not committed yet. Encryption checks remain below.
    const submittedDraft = draftRef.current;
    const text = submittedDraft.trim();
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    signalTyping(false);

    if (selfDestruct && attachments.pending.length > 0) { setError("Self-destruct is for text only. Remove attachments or turn it off."); return; }
    if (attachments.pending.length > 0) {
      if (sendPendingRef.current) return;
      setSendPending(true);
      setError(null);
      const uploadSignal = attachments.begin();
      try {
        await prepareEncryptedSend();
        if (uploadSignal.aborted) return;
        const result = await attachments.upload(
          conversationId,
          text,
          replyTo?.id ?? null,
          encryptPendingFile,
          (plain) => e2ee.encrypt(plain, conversationId),
          uploadSignal,
        );
        if (!result.ok) {
          if (result.error !== "Upload cancelled.") setError(result.error);
          return;
        }
        const created = result.message;
        setReplyTo(null);
        setItems((prev) =>
          prev.some((m) => m.id === created.id) ? prev : [...prev, created],
        );
        await clearDeliveredDraft(submittedDraft);
        nearBottomRef.current = true;
        scrollToBottom(true);
      } catch (cause) {
        if (!uploadSignal.aborted) setError(cause instanceof Error ? cause.message : "Couldn't prepare the file.");
      } finally {
        attachments.finish();
        setSendPending(false);
      }
      return;
    }

    if (!text || sendPendingRef.current) return;
    if (!navigator.onLine && selfDestruct) { setError("Reconnect to send a self-destructing message."); return; }
    const queued = items.find(message => (message.sendStatus === "queued" || message.sendStatus === "sending") && decryptedTextsRef.current.get(message.id) === text && message.replyToMessageId === (replyTo?.id ?? null));
    if (queued) { await retryFailedMessage(queued); return; }
    const clientMessageId = crypto.randomUUID();
    const releaseSend = claimQueuedSend(me.id, clientMessageId);
    if (!releaseSend) return;
    const optimisticId = `client:${clientMessageId}`;
    const now = new Date().toISOString();
    const optimistic: MessageDTO = {
      selfDestruct, revealedAt: null,
      id: optimisticId,
      clientMessageId,
      conversationId,
      text: "",
      type: "text",
      senderId: me.id,
      createdAt: now,
      updatedAt: now,
      editedAt: null,
      deletedAt: null,
      expiresAt: null,
      deliveredAt: null,
      replyToMessageId: replyTo?.id ?? null,
      replyTo: replyTo ? {
        id: replyTo.id,
        text: copyableText(replyTo),
        senderId: replyTo.senderId,
        senderName: replyTo.sender.displayName,
        deleted: Boolean(replyTo.deletedAt),
        encrypted: false,
      } : null,
      reactions: [],
      readBy: [],
      attachments: [],
      sender: me,
      starred: false,
      deletedForMe: false,
      pinned: false,
      forwarded: false,
      encrypted: true,
      sendStatus: "sending",
    };
    setDecryptedTexts((prev) => new Map(prev).set(optimisticId, text));
    setItems((prev) => [...prev, optimistic]);
    chatPerf("send-click-to-optimistic", sendStarted);
    const replyId = replyTo?.id ?? null;
    let clearedDraftRevision: number | null = null;
    nearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));
    setSendPending(true);
    setError(null);
    try {
      // E2EE: plaintext never leaves this device — send AES-GCM ciphertext.
      // Clear the visible composer immediately while the durable retry copy
      // and encrypted draft cleanup finish together. A save failure restores
      // the draft below; encryption and network work never block the clear.
      const queueSave = saveQueuedMessage(me.id, { message: { ...optimistic, sendStatus: "queued", queueReason: "Waiting for secure delivery. Your message will send automatically when encryption is ready." }, plain: text });
      const draftClear = clearDeliveredDraft(submittedDraft);
      clearedDraftRevision = draftRevision.current;
      const [queueResult] = await Promise.allSettled([queueSave, draftClear]);
      if (queueResult.status === "rejected") throw queueResult.reason;
      await prepareEncryptedSend(awaitingApproval && !conversation.introductionSent);
      chatPerf("send-key-ready", sendStarted);
      const payload = await e2ee.encrypt(text, conversationId);
      chatPerf("send-encrypted", sendStarted);
      const request = () => fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMessageId,
          selfDestruct,
          text: payload,
          replyToMessageId: replyId,
          encrypted: true,
        }),
      });
      let res: Response;
      try {
        res = await request();
      } catch {
        // A lost response may happen after the server committed. The stable
        // client id makes this retry return the original row, never a duplicate.
        res = await request().catch(() => { throw new SecureDeliveryWaiting("No internet. This will send when you're back online."); });
      }
      const data = (await res.json().catch(() => null)) as {
        message?: MessageDTO;
        error?: string;
      } | null;
      if (res.status >= 500 || res.status === 429) throw new SecureDeliveryWaiting("Connection problem. This will send by itself in a moment.");
      if (!res.ok || !data?.message) {
        await removeQueuedMessage(me.id, conversationId, clientMessageId).catch(() => undefined);
        if (!selfDestruct && clearedDraftRevision !== null && !draftRef.current && draftRevision.current === clearedDraftRevision) setDraft(submittedDraft);
        setError(data?.error ?? "Couldn't send. Tap to retry.");
        setItems((prev) => prev.map((m) => m.id === optimisticId ? { ...m, sendStatus: "failed" } : m));
        return;
      }
      const created = data.message;
      chatPerf("send-server-confirmed", sendStarted);
      await removeQueuedMessage(me.id, conversationId, clientMessageId).catch(() => undefined);
      await clearDeliveredDraft(submittedDraft);
      setDecryptedTexts((prev) => {
        const next = new Map(prev);
        next.delete(optimisticId);
        next.set(created.id, text);
        return next;
      });
      setItems((prev) => {
        const optimisticIndex = prev.findIndex((m) => m.id === optimisticId);
        if (optimisticIndex >= 0) {
          const next = prev.filter((m) => m.id !== created.id);
          const index = next.findIndex((m) => m.id === optimisticId);
          next[index] = { ...created, sendStatus: "sent" };
          return next;
        }
        return prev.some((m) => m.id === created.id)
          ? prev.map((m) => m.id === created.id ? { ...m, sendStatus: "sent" } : m)
          : [...prev, { ...created, sendStatus: "sent" }];
      });
      const ta = composerRef.current;
      if (ta && !draftRef.current) ta.style.height = "auto";
    } catch (cause) {
      const waiting = cause instanceof SecureDeliveryWaiting;
      if (waiting) {
        try {
          await saveQueuedMessage(me.id, { message: { ...optimistic, sendStatus: "queued", queueReason: cause.message }, plain: text });
          if (!selfDestruct) await clearDeliveredDraft(submittedDraft);
        } catch {
          setError("Couldn't save. Your draft is still here.");
          setItems(previous => previous.map(message => message.id === optimisticId ? { ...message, sendStatus: "failed" } : message));
          return;
        }
      }
      if (!waiting) {
        await removeQueuedMessage(me.id, conversationId, clientMessageId).catch(() => undefined);
        if (!selfDestruct && clearedDraftRevision !== null && !draftRef.current && draftRevision.current === clearedDraftRevision) setDraft(submittedDraft);
        setError(cause instanceof Error ? cause.message : "No connection. Message not sent.");
      }
      setItems((prev) => prev.map((m) => m.id === optimisticId ? { ...m, sendStatus: waiting ? "queued" : "failed", queueReason: waiting ? cause.message : undefined } : m));
    } finally {
      releaseSend();
      setSendPending(false);
      composerRef.current?.focus();
    }
  }

  async function sendVoiceMessage() {
    if (!recorder.audioBlob || sendPendingRef.current || !canCompose) return;
    setSendPending(true);
    setError(null);
    const signal = attachments.begin();
    try {
      const ext = recorder.audioBlob.type.includes("webm") ? ".webm" : recorder.audioBlob.type.includes("mp4") ? ".m4a" : ".ogg";
      const file = new File([recorder.audioBlob], `voice${ext}`, { type: recorder.audioBlob.type });
      await prepareEncryptedSend();
      if (signal.aborted) return;
      const result = await attachments.upload(conversationId, "", replyTo?.id ?? null,
        encryptPendingFile, undefined, signal, [{ id: "voice", file, previewUrl: null }]);
      if (!result.ok) { if (result.error !== "Upload cancelled.") setError(result.error); return; }
      setItems(prev => prev.some(m => m.id === result.message.id) ? prev : [...prev, result.message]);
      setReplyTo(null);
      recorder.clearRecording();
      nearBottomRef.current = true;
      scrollToBottom(true);
      router.refresh();
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "No connection. Your recording is still here.");
    } finally {
      attachments.finish();
      setSendPending(false);
    }
  }

  async function forwardOneMessage(
    targetConversationId: string,
    plain: string,
    preparedAttachments: Array<{
      bytes: ArrayBuffer;
      mimeType: string;
      originalName: string;
    }>,
  ) {
    if (!forwardMsg) return;
    const prep = await e2ee.prepareConversation(targetConversationId);
    if (!e2ee.initialized || !prep.ready) {
      throw new Error("That chat isn't ready. Nothing was sent.");
    }
    const text = plain ? await e2ee.encrypt(plain, targetConversationId) : plain;
    let res: Response;
    if (preparedAttachments.length) {
      const form = new FormData();
      form.append("conversationId", targetConversationId);
      form.append("forwarded", "true");
      form.append("encrypted", "true");
      form.append("text", text);
      let totalBytes = 0;
      for (const attachment of preparedAttachments) {
        let bytes = attachment.bytes.slice(0);
        const { key } = await e2ee.getConversationKey(targetConversationId);
        const mediaKey = await generateConversationKey();
        const wrapped = await encryptBytes(new TextEncoder().encode(await exportSymmetricKey(mediaKey)), key);
        bytes = b64ToBytes(await encryptBytes(bytes, mediaKey)).slice().buffer as ArrayBuffer;
        form.append("keys", wrapped);
        form.append("origTypes", attachment.mimeType);
        totalBytes += bytes.byteLength;
        if (totalBytes > 10 * 1024 * 1024) throw new Error("These files are too large to forward (10 MB max).");
        form.append("files", new Blob([bytes], { type: "application/octet-stream" }), attachment.originalName);
      }
      res = await fetch("/api/upload/message", { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
    } else {
      if (!plain.trim()) throw new Error("This message has no text to forward.");
      const clientMessageId = crypto.randomUUID();
      const request = () => fetch(`/api/conversations/${targetConversationId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientMessageId, text, replyToMessageId: null, forwarded: true, encrypted: true }),
        signal: AbortSignal.timeout(30000),
      });
      try {
        res = await request();
      } catch {
        res = await request();
      }
    }
    const result = await res.json().catch(() => null);
    if (!res.ok) throw new Error(result?.error ?? "Forwarding failed. Please try again.");
  }

  async function forwardMessage(
    targetConversationIds: string[],
    onProgress?: (conversationId: string, ok: boolean) => void,
  ) {
    if (!forwardMsg) return;
    const forwardStarted = performance.now();
    if (!targetConversationIds.length || targetConversationIds.length > 10) {
      throw new Error("Choose between 1 and 10 conversations.");
    }
    const source = forwardMsg;
    // Source crypto and downloads are invariant across destinations. Do them
    // once, then only re-encrypt independently for each destination key.
    const plain = source.encrypted && source.text
      ? await e2ee.decrypt(source.text, conversationId)
      : source.text;
    const preparedAttachments = await mapWithConcurrency(
      source.attachments,
      3,
      async (attachment) => {
        const download = await fetch(attachment.url, { signal: AbortSignal.timeout(30000) });
        if (!download.ok) throw new Error("Could not download the attachment to forward.");
        let bytes = await download.arrayBuffer();
        if (attachment.encrypted) {
          if (!attachment.encKey) throw new Error("This attachment's encryption key is unavailable.");
          let binary = "";
          for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
          bytes = await e2ee.decryptMedia(btoa(binary), attachment.encKey, conversationId);
        }
        return { bytes, mimeType: attachment.mimeType, originalName: attachment.originalName };
      },
    );
    chatPerf("forward-source-prepared", forwardStarted, { destinations: targetConversationIds.length });
    const results = await mapWithConcurrency(targetConversationIds, 3, async (targetId) => {
      try {
        await forwardOneMessage(targetId, plain, preparedAttachments);
        onProgress?.(targetId, true);
        return null;
      } catch (error) {
        onProgress?.(targetId, false);
        return error instanceof Error ? error.message : "Forwarding failed.";
      }
    });
    router.refresh();
    chatPerf("forward-complete", forwardStarted, {
      destinations: targetConversationIds.length,
      failures: results.filter(Boolean).length,
    });
    const failures = results.filter((result): result is string => Boolean(result));
    if (failures.length) {
      throw new Error(`${failures.length} of ${targetConversationIds.length} forwards failed. ${failures[0]}`);
    }
  }

  async function retryFailedMessage(message: MessageDTO) {
    if (!['failed', 'queued'].includes(message.sendStatus ?? '') || !message.clientMessageId || retryingMessages.current.has(message.clientMessageId) || cancelledMessages.current.has(message.clientMessageId)) return;
    const plain = decryptedTextsRef.current.get(message.id);
    if (!plain) return;
    const releaseSend = claimQueuedSend(me.id, message.clientMessageId);
    if (!releaseSend) return;
    retryingMessages.current.add(message.clientMessageId);
    setError(null);
    try {
      await prepareEncryptedSend(awaitingApproval && !conversation.introductionSent);
      if (cancelledMessages.current.has(message.clientMessageId)) return;
      setItems((current) => current.map((item) => item.id === message.id ? { ...item, sendStatus: "sending" } : item));
      const payload = await e2ee.encrypt(plain, conversationId);
      if (cancelledMessages.current.has(message.clientMessageId)) return;
      const request = () => fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMessageId: message.clientMessageId,
          selfDestruct: message.selfDestruct === true,
          text: payload,
          replyToMessageId: message.replyToMessageId,
          encrypted: true,
        }),
      });
      let res: Response;
      try { res = await request(); } catch { res = await request().catch(() => { throw new SecureDeliveryWaiting("No internet. This will send when you're back online."); }); }
      const data = await res.json().catch(() => null) as { message?: MessageDTO; error?: string } | null;
      if (res.status >= 500 || res.status === 429) throw new SecureDeliveryWaiting("Connection problem. This will send by itself in a moment.");
      if (!res.ok || !data?.message) throw new Error(data?.error ?? "Message failed to send.");
      const created = data.message;
      await removeQueuedMessage(me.id, conversationId, message.clientMessageId).catch(() => undefined);
      await clearDeliveredDraft(plain, true);
      setDecryptedTexts((current) => {
        const next = new Map(current);
        next.delete(message.id);
        next.set(created.id, plain);
        return next;
      });
      setItems((current) => {
        const optimisticIndex = current.findIndex((item) => item.id === message.id);
        if (optimisticIndex >= 0) {
          const next = current.filter((item) => item.id !== created.id);
          const index = next.findIndex((item) => item.id === message.id);
          next[index] = { ...created, sendStatus: "sent" };
          return next;
        }
        return current.some((item) => item.id === created.id)
          ? current.map((item) => item.id === created.id ? { ...item, sendStatus: "sent" } : item)
          : [...current, { ...created, sendStatus: "sent" }];
      });
    } catch (cause) {
      if (cancelledMessages.current.has(message.clientMessageId)) return;
      const waiting = cause instanceof SecureDeliveryWaiting;
      if (waiting) await saveQueuedMessage(me.id, { message: { ...message, sendStatus: "queued", queueReason: cause.message }, plain }).catch(() => undefined);
      setItems((current) => current.map((item) =>
        item.id === message.id ? { ...item, sendStatus: waiting ? "queued" : "failed", queueReason: waiting ? cause.message : undefined } : item,
      ));
      if (!waiting) {
        // A rejected retry must not discard text already accepted into the
        // durable offline queue. Keep it for explicit retry or cancellation.
        await saveQueuedMessage(me.id, { message: { ...message, sendStatus: "failed", queueReason: cause instanceof Error ? cause.message : "Message failed to send." }, plain }).catch(() => undefined);
        setError(cause instanceof Error ? cause.message : "Message failed to send.");
      }
    } finally {
      releaseSend();
      retryingMessages.current.delete(message.clientMessageId);
    }
  }

  const retryingMessages = useRef(new Set<string>());
  const cancelledMessages = useRef(new Set<string>());
  const queuedRetry = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    queuedRetry.current = async () => {
      if (sendPendingRef.current || document.visibilityState !== "visible" || !navigator.onLine) return;
      for (const message of items.filter(item => item.sendStatus === "queued")) await retryFailedMessage(message);
    };
  });
  useEffect(() => {
    let stopped = false;
    void loadQueuedMessages(me.id, conversationId).then(entries => {
      if (stopped) return;
      const committed = new Set(initial.messages.map(message => message.clientMessageId));
      const pending = entries.filter(entry => !committed.has(entry.message.clientMessageId));
      for (const entry of entries.filter(entry => committed.has(entry.message.clientMessageId))) {
        void removeQueuedMessage(me.id, conversationId, entry.message.clientMessageId!).catch(() => undefined);
      }
      setDecryptedTexts(current => {
        const next = new Map(current);
        for (const entry of pending) next.set(entry.message.id, entry.plain);
        return next;
      });
      setItems(current => {
        const known = new Set(current.map(message => message.clientMessageId));
        return [...current, ...pending.filter(entry => !known.has(entry.message.clientMessageId)).map(entry => ({ ...entry.message, sendStatus: entry.message.sendStatus === "failed" ? "failed" as const : "queued" as const }))];
      });
    }).catch(() => undefined);
    const resume = () => { if (!stopped) void queuedRetry.current(); };
    const timer = window.setInterval(resume, 30_000);
    const first = window.setTimeout(resume, 2_000);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("maddy:message-request-keys", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      window.clearInterval(timer); window.clearTimeout(first);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("maddy:message-request-keys", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [conversationId, me.id, initial.messages]);

  async function scheduleSendMessage() {
    const text = draftRef.current.trim();
    if (!text || !scheduledTime || sendPendingRef.current) return;
    const scheduledFor = new Date(scheduledTime);
    if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor <= new Date()) {
      setError("Scheduled time must be in the future.");
      return;
    }
    setSendPending(true);
    setError(null);
    try {
      await prepareEncryptedSend();
      const payload = await e2ee.encrypt(text, conversationId);
      const res = await fetch(`/api/conversations/${conversationId}/scheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: payload,
          scheduledFor: scheduledFor.toISOString(),
          replyToMessageId: replyTo?.id ?? null,
          encrypted: true,
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
      await prepareEncryptedSend();
      const res = await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: await e2ee.encrypt(text, conversationId), encrypted: true }),
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
      if (updated.encrypted) setDecryptedTexts(prev => new Map(prev).set(id, text));
      setItems((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network error while editing.");
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

  const bgValue = conversation.backgroundStyle ?? null;
  const bgOpacity = (conversation.backgroundOpacity ?? 100) / 100;
  const bubbleTheme = chatBubbleTheme(bgValue);
  let bgStyle: React.CSSProperties | undefined;
  if (bgValue && bgValue !== "default") {
    const preset = CHAT_BACKGROUNDS.find((p) => p.key === bgValue);
    const pattern = getPattern(bgValue);
    if (isBackgroundImage(bgValue)) {
      bgStyle = {
        backgroundImage: `url(${JSON.stringify(bgValue)})`,
        backgroundSize: "cover",
        backgroundPosition: `${conversation.backgroundPositionX ?? 50}% ${conversation.backgroundPositionY ?? 50}%`,
        backgroundRepeat: "no-repeat",
        opacity: bgOpacity,
      };
    } else if (pattern) {
      bgStyle = { backgroundImage: pattern.background(1), backgroundColor: pattern.baseColor, backgroundRepeat: "repeat", backgroundSize: "auto", opacity: bgOpacity };
    } else {
      const resolved = preset?.color ?? bgValue;
      bgStyle = resolved.includes("gradient(")
        ? { backgroundImage: resolved, backgroundSize: "cover", backgroundRepeat: "no-repeat", opacity: bgOpacity }
        : { backgroundImage: "none", backgroundColor: resolved, opacity: bgOpacity };
    }
  }

  /* -------------------------------- composer ------------------------------- */

  function growComposer() {
    if (composerResizeFrame.current !== null) return;
    composerResizeFrame.current = requestAnimationFrame(() => {
      composerResizeFrame.current = null;
      const ta = composerRef.current;
      if (!ta) return;
      // Coalesce layout reads instead of forcing layout in each input handler.
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`;
    });
  }

  function onComposerKey(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
    if (e.key === "Escape") setReplyTo(null);
  }

  /* -------------------------------- render --------------------------------- */

  // Keep handlers current after commit without changing every row's props on each keystroke.
  const rowActions = useCommittedRef<RowActions>({
      editDraft: setEditDraft, saveEdit: id => { void saveEdit(id); }, cancelEdit: () => setEditingId(null),
      menu: setMobileMenuMsg, reply: message => { setReplyTo(message); composerRef.current?.focus(); }, forward: setForwardMsg,
      jump: jumpTo, reveal: message => { void revealMessage(message); }, retryDecrypt: id => {
        failedDecryptionRef.current.delete(id);
        setUnavailableMessageIds(current => { const next = new Set(current); next.delete(id); return next; });
        setDecryptRetry(value => value + 1);
      },
      deviceSettings: () => router.push("/app/profile#encryption-devices"), security: () => setShowEncryptionInfo(true),
      retrySend: message => { void retryFailedMessage(message); }, cancelQueued: async message => {
        if (!message.clientMessageId) return;
        cancelledMessages.current.add(message.clientMessageId);
        try { await removeQueuedMessage(me.id, conversationId, message.clientMessageId); setItems(current => current.filter(item => item.id !== message.id)); }
        catch { cancelledMessages.current.delete(message.clientMessageId); setError("Could not cancel the saved message. Please retry."); }
      },
      react: (message, emoji) => { void toggleReaction(message, emoji); }, star: message => { void toggleStar(message); },
      pin: message => { void togglePin(message); }, copy: copyText, report: setReportMsg,
      edit: message => { if (!isPendingDecrypt(message)) { setEditingId(message.id); setEditDraft(copyableText(message)); } },
      delete: (id, mode) => { void executeDelete(id, mode); }, cancelDelete: () => setPendingDelete(null),
      requestDelete: id => setPendingDelete({ id, mode: "for_everyone" }),
  });

  // Filter out messages deleted-for-me and compute grouped view.
  const visibleItems = useMemo(
    () => items.filter((m) => !m.deletedForMe),
    [items],
  );

  const grouped = useMemo(
    () =>
      visibleItems.map((msg, i) => ({
        msg,
        showDate: i === 0 || !sameDay(visibleItems[i - 1].createdAt, msg.createdAt, hydrated),
        sameSenderPrev:
          i > 0 &&
          visibleItems[i - 1].senderId === msg.senderId &&
          !msg.replyTo &&
          sameDay(visibleItems[i - 1].createdAt, msg.createdAt, hydrated) &&
          new Date(msg.createdAt).getTime() -
            new Date(visibleItems[i - 1].createdAt).getTime() <
            5 * 60_000,
      })),
    [visibleItems, hydrated],
  );

  const firstVisibleUnreadId = useMemo(
    () => visibleItems.find((message) => initialUnread?.ids.has(message.id))?.id ?? null,
    [initialUnread, visibleItems],
  );

  // Keep the unread separator, but ordinary chat entry opens at the latest message.

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
    <E2EEMediaProvider conversationId={conversationId} decryptMedia={e2ee.decryptMedia} initialized={e2ee.initialized} initializationError={e2ee.error}>
    <div className="flex h-full w-full min-w-0 overflow-hidden overflow-x-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ------------------------------ header ------------------------------ */}
      <header className="flex h-14 min-w-0 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 sm:gap-3 sm:px-4">
        <Link
          href="/app/chats"
          aria-label="Back to chats"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_12%,transparent)] hover:text-[var(--text)] lg:hidden"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        {isGroup ? (
          <button type="button" onClick={() => setShowDetails(true)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            {conversation.avatarUrl ? <Image unoptimized width={36} height={36} src={conversation.avatarUrl} alt="Group photo" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]"><Users className="h-4 w-4 text-[var(--accent-fg)]" /></span>}
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
                    ? hydrated ? `Last seen ${timeAgo(otherLastSeen)}` : "Last seen"
                    : "Offline"}
              </span>
            </span>
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="text-sm text-[var(--muted)]">Conversation</span>
          </div>
        )}

        {isGroup ? <button type="button" aria-label="Open group settings" title="Group settings" onClick={() => setShowDetails(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-2)]"><Settings className="h-5 w-5" /></button> : null}
        {!isGroup && other ? <button type="button" aria-label="Start audio call" title="Direct audio call · keep Circlo open" disabled={audioCall.busy || conversation.blocked || conversation.requestPending || conversation.awaitingApproval} onClick={() => audioCall.start(conversationId, otherName)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-2)] disabled:opacity-40"><Phone className="h-5 w-5" /></button> : null}
        {showHeaderSearch ? <MessageSearch open onOpenChange={setShowHeaderSearch} /> : null}

        <button
          type="button"
          onClick={() => setShowEncryptionInfo(true)}
          aria-label={
            e2eeState.ready && e2eeState.needsRotation
              ? "Chat safety check needed. View details"
              : e2eeState.ready
                ? "Private chat protection is on. View details"
                : "Private chat status"
          }
          title={
            e2eeState.checking
              ? "Checking chat protection…"
              : e2eeState.ready
                ? "Private chat protected"
                : e2eeState.peersMissingKeys > 0
                  ? "Waiting for the other person to open Circlo"
                  : "Chat protection is not ready"
          }
          className={cn(
            "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full px-2 transition-colors sm:px-2.5",
            e2eeState.ready
              ? "text-[var(--accent-fg)] hover:bg-[var(--accent-soft)]"
              : "text-[var(--muted)] hover:bg-[var(--surface-2)]",
          )}
        >
          {e2eeState.checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : e2eeState.ready ? (
            <span className="relative flex">
              <Lock className="h-4 w-4" />
              {e2eeState.needsRotation ? <span aria-hidden="true" className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-500" /> : null}
            </span>
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
        </button>

        <ChatActionsMenu
          conversationId={conversationId}
          conversation={conversation}
          other={other}
          onOpenInfo={() => setShowDetails(true)}
          onOpenSearch={() => setShowHeaderSearch(true)}
          onReport={() => setReportChat(true)}
        />

      </header>

      {encryptionNoticeFor === encryptionNoticeKey ? (
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2 text-[0.72rem] text-[var(--muted)]" role="status">
          <span className="min-w-0 flex-1">Messages in this chat are end-to-end encrypted and can be read only on devices in this conversation.</span>
          <button type="button" className="min-h-11 shrink-0 px-2 font-medium text-[var(--text)]" onClick={() => setEncryptionNoticeFor(null)} aria-label="Dismiss encryption notice">Dismiss</button>
        </div>
      ) : null}
      {e2eeState.trustChanged ? (
        <button
          type="button"
          onClick={() => {
            void e2ee.getPendingPeerVerification(conversationId).then(setPeerReview)
              .catch(() => setError("Device details changed. Retry verification before sending."));
          }}
          className="flex items-center gap-2 border-b border-[var(--warning,#f59e0b)] bg-[color-mix(in_srgb,var(--warning,#f59e0b)_10%,var(--surface))] px-4 py-2 text-left"
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 text-[0.72rem] text-[var(--muted)]">A device changed in this chat. Check the safety numbers before you approve.</span>
          <span className="shrink-0 text-[0.65rem] font-bold text-amber-700">Approve</span>
        </button>
      ) : e2eeState.peersMissingKeys > 0 && !e2eeState.checking && !awaitingApproval ? (
        <button
          type="button"
          onClick={() => setShowEncryptionInfo(true)}
          className="flex items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--warning,#f59e0b)_8%,var(--surface))] px-4 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
        >
          <ShieldCheck className="h-3 w-3 shrink-0 text-amber-500" />
          <span className="min-w-0 flex-1 truncate text-[0.7rem] text-[var(--muted)]">
            Encryption is being set up — ask the other person to open Circlo once.
          </span>
          <span className="shrink-0 text-[0.62rem] font-bold uppercase tracking-wide text-amber-600">
            Details
          </span>
        </button>
      ) : null}

      {awaitingApproval ? (
        <div role="status" className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-3">
          <p className="text-sm font-semibold">{sendPending ? "Sending message request" : requestSent ? "Message request sent" : "Start with a message request"}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{requestSent
            ? "They've been notified. You can send more messages after they accept. Secure delivery may wait for their phone to be ready and come back online."
            : "You can send one encrypted introduction. The other person will receive an approval request before you can send more."}</p>
        </div>
      ) : null}
      {!requestAccepted ? (
        <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-4 py-3">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Message request</p>
              <p className="text-xs text-[var(--muted)]">Someone wants to contact you. Accept to reply. No read receipt is sent before approval. If secure delivery is pending, the introduction will appear when its encryption key arrives.</p>
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
            jumpTo(firstPinned.id);
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
      <div className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden" style={bubbleTheme}>
      <div aria-hidden="true" className="chat-message-area pointer-events-none absolute inset-0 -z-10" style={bgStyle} />
      <div
        ref={attachScrollElement}
        role="region"
        aria-label="Messages"
        style={{ overflowAnchor: "none" }}
        tabIndex={0}
        onWheel={(event) => { if (event.deltaY < 0 && event.currentTarget.scrollHeight > event.currentTarget.clientHeight) followLatestRef.current = false; }}
        onTouchStart={(event) => { touchScrollY.current = event.touches[0]?.clientY ?? 0; }}
        onTouchMove={(event) => {
          const nextY = event.touches[0]?.clientY ?? touchScrollY.current;
          if (nextY > touchScrollY.current && event.currentTarget.scrollHeight > event.currentTarget.clientHeight) followLatestRef.current = false;
          touchScrollY.current = nextY;
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget && event.currentTarget.scrollHeight > event.currentTarget.clientHeight && event.clientX >= event.currentTarget.getBoundingClientRect().right - 20) followLatestRef.current = false;
        }}
        onKeyDown={(event) => {
          if ((["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) && event.currentTarget.scrollHeight > event.currentTarget.clientHeight) followLatestRef.current = false;
        }}
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
            if (!mediaPaused) attachments.addFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6",
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
              className="btn btn-secondary py-1.5! text-xs!"
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
          <p className="mx-auto w-fit rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-[0.64rem] font-medium uppercase tracking-widest text-[var(--muted)] shadow-sm">
            Beginning of conversation
          </p>
        ) : null}

        {items.length === 0 ? (
          <div className="mx-auto flex h-full w-fit flex-col items-center justify-center rounded-3xl bg-[var(--surface)] px-6 py-16 text-center">
            <Avatar user={other ?? me} size={64} />
            <p className="mt-5 font-semibold">No messages yet</p>
            <p className="mt-1.5 max-w-[15rem] text-sm leading-relaxed text-[var(--muted)]">
              Say hello to {otherName.split(" ")[0]}.
            </p>
          </div>
        ) : (
          <VirtualMessageHistory items={grouped} scrollRef={scrollRef} scrollElement={scrollElement} contentRef={messageContentRef} historyRef={historyRef}
            editingId={editingId} renderItem={({msg, showDate, sameSenderPrev}) => <MessageRow key={msg.id}
              msg={msg} showDate={showDate} sameSenderPrev={sameSenderPrev} me={me} hydrated={hydrated} isGroup={isGroup}
              highlighted={highlightId === msg.id} unreadCount={msg.id === firstVisibleUnreadId ? initialUnread?.count ?? 0 : null}
              editing={editingId === msg.id} editDraft={editingId === msg.id ? editDraft : ""} busy={busyId === msg.id}
              text={textOf(msg)} copyableText={copyableText(msg)} decryptedText={decryptedTexts.get(msg.id)}
              replyText={msg.replyTo ? decryptedReplies.get(msg.replyTo.id) : undefined}
              unavailable={unavailableMessageIds.has(msg.id)} replyUnavailable={Boolean(msg.replyTo && unavailableMessageIds.has(`reply:${msg.replyTo.id}`))}
              missingKey={missingMessageKeys.current.has(msg.id)} deviceError={Boolean(e2ee.error)} encryptionInitialized={e2ee.initialized}
              introduction={!requestAccepted && conversation.requestInitiatorId !== me.id} clockOffset={serverClockOffset.current}
              pendingDecrypt={isPendingDecrypt(msg)} deleteMode={pendingDelete?.id === msg.id ? pendingDelete.mode : undefined}
              actions={rowActions} nodeRefs={nodeRefs}
            />} />
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
                <span className="sr-only">{conversation.type === "group" ? "Someone" : otherName} is typing</span>
              </div>
            </div>
          ) : null}
        </div>
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
                    ? "Encrypted message"
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

        {selfDestruct ? <p role="status" className="mb-2 flex items-center gap-1.5 px-2 text-xs font-medium text-[var(--accent-fg)]"><Timer className="h-3.5 w-3.5" />Disappears 5 seconds after first reveal</p> : null}
        {mediaPaused || schedulePaused ? <p className="mb-2 text-xs text-[var(--muted)]">{mediaPaused ? "Uploads and voice messages are unavailable. " : ""}{schedulePaused ? "Scheduled sending is unavailable." : ""}</p> : null}
        <AttachmentPreviews
          pending={attachments.pending}
          progress={attachments.progress}
          phase={attachments.phase}
          busy={sendPending}
          caption={draftRef.current}
          error={error}
          onCaptionChange={setDraft}
          onCaptionInput={value => { draftRevision.current += 1; draftRef.current = value; queueDraftPersistence(); }}
          onSend={() => void send()}
          onClear={attachments.clear}
          onRemove={attachments.removeFile}
          onCancel={attachments.cancel}
        />

        {mentionOptions.length ? <div className="mb-2 max-h-48 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-lg">{mentionOptions.map((member) => <button key={member.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertMention(member.username)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-[var(--surface-2)]"><Avatar user={member} size={28} /><span className="min-w-0"><b className="block truncate text-xs">{member.displayName}</b><small className="text-[var(--muted)]">@{member.username}</small></span></button>)}</div> : null}

        {/* Voice recording UI */}
        {recorder.state !== "idle" ? (
          <VoiceComposer recorder={recorder} me={me} sending={sendPending} phase={attachments.phase} progress={attachments.progress} onSend={() => void sendVoiceMessage()} onCancelUpload={attachments.cancel} />
        ) : (
          <div className="composer-row flex items-end gap-1 rounded-[24px] bg-[var(--input-bg)] p-1.5">
            <AttachButton
              compact
              hideTrigger
              inputId={`chat-files-${conversationId}`}
              onFiles={(files) => attachments.addFiles(files)}
              disabled={mediaPaused || sendPending || !canCompose || awaitingApproval}
            />

            {/* Emoji button */}
            <div className="relative">
              <button
                ref={mediaPickerAnchor}
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                aria-label="Emoji"
                title="Add attachments, emoji, stickers or GIFs"
                aria-expanded={showEmoji}
                disabled={!canCompose}
                className="composer-icon flex h-11 w-11 flex-none items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)]"
              >
                <Plus className="h-5 w-5" />
                <span className="sr-only">Emoji</span>
              </button>
              {showEmoji ? (
                <MediaPicker
                  anchor={mediaPickerAnchor}
                  mediaDisabled={mediaPaused || sendPending || !canCompose || awaitingApproval}
                  onAttach={() => { (document.getElementById(`chat-files-${conversationId}`) as HTMLInputElement | null)?.click(); setShowEmoji(false); }}
                  onSchedule={!selfDestruct && !schedulePaused && !sendPending && canCompose && !awaitingApproval ? () => { setShowEmoji(false); setDraftState(draftRef.current); setShowSchedule(true); } : undefined}
                  onFile={file => { setShowEmoji(false); attachments.addFiles([file]); }}
                  onEmoji={(emoji) => {
                    setDraft((prev) => prev + emoji);
                    growComposer();
                    composerRef.current?.focus();
                  }}
                  onClose={() => { setShowEmoji(false); composerRef.current?.focus(); }}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 px-1">
              <textarea
                ref={composerRef}
                defaultValue={draft}
                onChange={(e) => {
                  // Let the browser paint the keystroke immediately. Updating
                  // mentions/buttons/history is interruptible background work.
                  const value = e.target.value;
                  draftRevision.current++;
                  draftRef.current = value;
                  if (draftUpdateTimer.current) clearTimeout(draftUpdateTimer.current);
                  draftUpdateTimer.current = setTimeout(() => {
                    startTransition(() => setDraftState(previous => {
                      const latest = draftRef.current;
                      const mention = (text: string) => isGroup ? text.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/)?.[1] ?? null : null;
                      return Boolean(previous.trim()) !== Boolean(latest.trim()) || mention(previous) !== mention(latest) || showSchedule ? latest : previous;
                    }));
                  }, 100);
                  queueDraftPersistence();
                  // Clearing has no encryption cost. Retire the saved draft
                  // immediately rather than leaving the old text recoverable
                  // until a debounce fires on a busy mobile browser.
                  // Explicit user intent must also retire the record while
                  // draft restoration is pending (the normal save gate is
                  // deliberately closed during that restoration).
                  if (!value) void saveChatDraft(me.id, conversationId, "").catch(() => {});
                  growComposer();
                  if (e.target.value.trim()) noteTyping();
                  else signalTyping(false);
                }}
                onBlur={() => signalTyping(false)}
                onKeyDown={onComposerKey}
                placeholder={requestAccepted ? "Message…" : "Accept this request to reply"}
                disabled={!canCompose}
                aria-label="Message text"
                rows={1}
                maxLength={2000}
                className="chat-composer block min-h-11 max-h-24 w-full resize-none overflow-y-auto border-0 bg-transparent py-3 text-[0.93rem] leading-5 outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
              />
            </div>
            {draft.trim() || attachments.pending.length > 0 ? (
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" role="checkbox" aria-checked={selfDestruct} aria-label="Self-destruct message · 5 seconds after first reveal" title={selfDestruct ? "Turn off self-destruct for this message" : "Self-destruct: disappears 5 seconds after first reveal"} disabled={sendPending || attachments.pending.length > 0 || awaitingApproval} onClick={() => { const enabled=!selfDestruct;selfDestructDraft.current=enabled;setSelfDestruct(enabled);if(enabled)void saveChatDraft(me.id,conversationId,"").catch(()=>{});else queueDraftPersistence(); }} className={cn("composer-icon flex h-11 w-11 flex-none items-center justify-center rounded-full transition-colors",selfDestruct ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}><Timer className="h-4.5 w-4.5" /></button>
                <button
                  type="submit"
                  disabled={sendPending || !canCompose}
                  aria-label="Send message"
                  className="composer-icon btn btn-primary h-11 w-11 flex-none rounded-full! p-0!"
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
                disabled={mediaPaused || !canCompose || awaitingApproval}
                onClick={() => void recorder.startRecording()}
                aria-label="Record voice message"
                title={mediaPaused ? "Voice messages are paused" : "Record voice message"}
                className="composer-icon flex h-11 w-11 flex-none items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
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
          onMetadataUpdate={patch => setMetadataUpdate(previous => ({ ...(previous?.updatedAt && Date.parse(previous.updatedAt) >= Date.parse(serverConversation.updatedAt) ? previous : {}), ...patch }))}
          onClose={() => setShowDetails(false)}
        />
      ) : null}

      {/* Mobile long-press context menu */}
      {mobileMenuMsg ? <MobileMessageMenu
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
        starred={mobileMenuMsg?.starred}
        pinned={mobileMenuMsg?.pinned}
        onStar={() => {if(mobileMenuMsg) void toggleStar(mobileMenuMsg);}}
        onPin={() => {if(mobileMenuMsg) void togglePin(mobileMenuMsg);}}
        onEdit={() => {
          if(mobileMenuMsg && !isPendingDecrypt(mobileMenuMsg)){
            setEditingId(mobileMenuMsg.id);
            setEditDraft(copyableText(mobileMenuMsg));
          }
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
      /> : null}

      {/* Forward dialog */}
      {peerReview ? <PeerVerificationDialog key={peerReview.signature} review={peerReview}
        names={Object.fromEntries(conversation.members.map(member => [member.id, member.displayName]))}
        onClose={() => setPeerReview(null)} onConfirm={() => {
          if (!e2ee.approvePeerKeyChange(conversationId, peerReview.signature)) {
            setPeerReview(null); setError("Device details changed during verification. Review them again."); return;
          }
          setPeerReview(null);
          setE2eeState(previous => ({ ...previous, checking: true, trustChanged: false }));
          void e2ee.prepareConversation(conversationId).then(prepared =>
            setE2eeState(previous => ({ ...previous, ready: prepared.ready, fingerprint: prepared.fingerprint, checking: false, trustChanged: Boolean(prepared.trustChanged) })))
            .catch(() => { setE2eeState(previous => ({ ...previous, ready: false, checking: false })); setError("Secure delivery is waiting. Retry when your connection returns."); });
        }} /> : null}
      {forwardMsg ? <ForwardDialog
        open={forwardMsg !== null}
        message={forwardMsg}
        preview={forwardMsg ? copyableText(forwardMsg) : ""}
        onClose={() => setForwardMsg(null)}
        onForward={forwardMessage}
      /> : null}

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

      {reportChat && other ? (
        <ReportDialog
          type="user"
          targetUserId={other.id}
          targetName={other.displayName}
          onClose={() => setReportChat(false)}
        />
      ) : null}

      {/* Schedule message dialog */}
      {showSchedule ? (
        <div role="dialog" aria-modal="true" aria-label="Schedule message" className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4">
          <div className="card-glass max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl p-4 sm:p-6 animate-fade-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-[var(--accent)]" />
                <h3 className="text-base font-bold">Schedule Message</h3>
              </div>
              <button type="button" onClick={() => { setShowSchedule(false); setScheduledTime(""); }} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">Write your message and choose when to send it. Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
            <label className="mt-4 block text-sm font-medium">Message
              <textarea aria-label="Scheduled message text" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={2000} rows={3} placeholder="Write the message to send later…" className="field-input mt-1 w-full resize-y" disabled={sendPending} />
            </label>
            <div className="mt-4">
              <input
                type="datetime-local"
                aria-label="Scheduled delivery time"
                step="1"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            {!draft.trim() ? <p className="mt-2 text-xs text-[var(--muted)]">Enter a message to enable scheduling.</p> : null}
            {error ? <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
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
          needsRotation={e2eeState.needsRotation}
          peersMissing={e2eeState.peersMissingKeys}
          conversationName={otherName}
          onRestoreOtherDevices={() => e2ee.syncKnownConversations(conversationId)}
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
  needsRotation,
  conversationName,
  onRestoreOtherDevices,
  onClose,
}: {
  ready: boolean;
  checking: boolean;
  fingerprint: string | null;
  error: string | null;
  peersMissing: number;
  needsRotation: boolean;
  conversationName: string;
  onRestoreOtherDevices: () => Promise<string>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Private chat protection details" className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card-glass max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl animate-fade-up">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]">
            {ready ? (
              <Lock className="h-5 w-5 text-[var(--accent-fg)]" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-[var(--muted)]" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold">Private chat protection</h3>
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
              Checking chat protection…
            </div>
          ) : error ? (
            <p role="alert" className="py-6 text-sm text-[var(--muted)]">{error}</p>
          ) : ready ? (
            <>
              {needsRotation ? <p role="alert" className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200">A device safety check changed. Review the code below before continuing.</p> : null}
              <div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-3.5 py-2.5">
                <Lock className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" />
                <p className="text-xs leading-relaxed">
                  Your device locks messages before sending. Only approved devices in this chat can open them; Circlo cannot read them.
                </p>
              </div>

              {fingerprint ? (
                <div className="mt-4">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Verify the other person&apos;s device
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    Compare this safety code with {conversationName}&apos;s device
                    in person or over a trusted call. If the numbers match, you
                    know you are checking the right device.
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
                  Your messages, voice notes and files are locked before they leave your device.
                </li>
                <li className="flex items-start gap-2 text-xs text-[var(--muted)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  Circlo cannot open private chat messages.
                </li>
                <li className="flex items-start gap-2 text-xs text-[var(--muted)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  Each chat has its own protection. Approved devices keep what they need to open older messages.
                </li>
                <li className="flex items-start gap-2 text-xs text-[var(--muted)]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  Group protection is updated when members or approved devices change. This chat does not create a new protection code for every message.
                </li>
              </ul>
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  Missing older messages on another device? Use this on a device that can already read them to share access with your other signed-in devices.
                </p>
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => {
                    setRestoring(true);
                    setRestoreResult(null);
                    void onRestoreOtherDevices()
                      .then(setRestoreResult)
                      .catch((cause: unknown) => setRestoreResult(cause instanceof Error ? cause.message : "Device restoration failed. Please retry."))
                      .finally(() => setRestoring(false));
                  }}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-soft)] disabled:cursor-wait disabled:opacity-60"
                >
                  {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {restoring ? "Sharing chat access…" : "Share chat access with my devices"}
                </button>
                {restoreResult ? <p role="status" className="mt-2 text-xs text-[var(--muted)]">{restoreResult}</p> : null}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                Private chat protection needs each person&apos;s device to be ready. {peersMissing > 0
                  ? `Waiting for ${peersMissing} person${peersMissing > 1 ? "s" : ""} to open Circlo so this chat can be protected.`
                  : "Chat protection is still being set up."}
              </p>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                  New messages will be protected automatically when everyone&apos;s device is ready.
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

function SelfDestructCountdown({ deadline, offset }: { deadline: string | null; offset: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!deadline) return; const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, [deadline]);
  return <span className="mb-1 block text-[0.65rem] opacity-75" role="timer">{deadline ? `${Math.max(0, Math.ceil((Date.parse(deadline) - now - offset) / 1000))}s remaining` : "5 seconds after first reveal"}</span>;
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


const MessageText = memo(function MessageText({ text }: { text: string }) {
  const parsed = parseStatusReply(text);
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
          <LinkedMessageText text={parsed.replyText ?? ""} />
        </p>
      </div>
    );
  }
  return (
    <p className={cn("whitespace-pre-wrap break-words", emojiOnlyCount(text) === 1 ? "emoji-message text-[3.5rem] leading-tight py-1" : emojiOnlyCount(text) ? "text-[2.5rem] leading-tight py-1" : "text-[0.9rem] leading-relaxed")}>
      {emojiOnlyCount(text) ? text : <LinkedMessageText text={text} />}
    </p>
  );

});

function LinkedMessageText({ text }: { text: string }) {
  return <>{splitMessageLinks(text).map((part, index) => part.type === "link" ? (
    <a
      key={`${index}:${part.href}`}
      href={part.href}
      rel="noopener noreferrer"
      className="break-all text-[var(--accent-fg)] underline underline-offset-2"
      onClick={(event) => event.stopPropagation()}
    >
      {part.value}
    </a>
  ) : <span key={`${index}:${part.value.slice(0, 12)}`}>{part.value}</span>)}</>;
}

type RowActions = {
  editDraft: (text: string) => void; saveEdit: (id: string) => void; cancelEdit: () => void;
  menu: (message: MessageDTO) => void; reply: (message: MessageDTO) => void; forward: (message: MessageDTO) => void;
  jump: (id: string) => void; reveal: (message: MessageDTO) => void; retryDecrypt: (id: string) => void;
  deviceSettings: () => void; security: () => void; retrySend: (message: MessageDTO) => void;
  cancelQueued: (message: MessageDTO) => void; react: (message: MessageDTO, emoji: string) => void;
  star: (message: MessageDTO) => void; pin: (message: MessageDTO) => void; copy: (text: string) => void;
  report: (message: MessageDTO) => void; edit: (message: MessageDTO) => void;
  delete: (id: string, mode: "for_me" | "for_everyone") => void; cancelDelete: () => void; requestDelete: (id: string) => void;
};
type MessageRowProps = {
  msg: MessageDTO; showDate: boolean; sameSenderPrev: boolean; me: SafeUser; hydrated: boolean; isGroup: boolean;
  highlighted: boolean; unreadCount: number | null; editing: boolean; editDraft: string; busy: boolean;
  text: string; copyableText: string; decryptedText: string | undefined; replyText: string | undefined;
  unavailable: boolean; replyUnavailable: boolean; missingKey: boolean; deviceError: boolean;
  encryptionInitialized: boolean; introduction: boolean; clockOffset: number; pendingDecrypt: boolean;
  deleteMode: "for_me" | "for_everyone" | undefined;
  actions: React.RefObject<RowActions | null>; nodeRefs: React.RefObject<Map<string, HTMLDivElement | null>>;
};
/** All render inputs are explicit; immutable message updates use React's full shallow comparison. */
const MessageRow = memo(function MessageRow({msg, showDate, sameSenderPrev, me, hydrated, isGroup,
  highlighted, unreadCount, editing, editDraft, busy, text, copyableText, decryptedText, replyText,
  unavailable, replyUnavailable, missingKey, deviceError, encryptionInitialized, introduction,
  clockOffset, pendingDecrypt, deleteMode, actions, nodeRefs}: MessageRowProps) {
              const own = msg.senderId === me.id;
              const deleted = msg.deletedAt !== null;
              if (msg.type === "system") return <div key={msg.id} data-message-id={msg.id} className="my-4 flex justify-center"><p className="max-w-[90%] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-center text-xs text-[var(--muted)]">{msg.text}</p></div>;
              return (
                <div
                  key={msg.id}
                  data-message-id={msg.id}
                  className="message-history-row"
                  style={{ containIntrinsicSize: `auto ${msg.attachments.length ? 280 : 80}px` }}
                  ref={(node) => {
                    if (node) nodeRefs.current.set(msg.id, node); else nodeRefs.current.delete(msg.id);
                  }}
                >
                  {unreadCount !== null ? (
                    <div className="my-4 flex items-center gap-3" role="separator" aria-label={`${unreadCount ?? 0} unread messages`}>
                      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]" />
                      <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-[0.68rem] font-semibold text-[var(--accent-fg)] shadow-sm">
                        {unreadCount ?? 0} unread {unreadCount === 1 ? "message" : "messages"}
                      </span>
                      <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]" />
                    </div>
                  ) : null}
                  {showDate ? (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full bg-[var(--surface)] px-3.5 py-1.5 text-[0.66rem] font-medium text-[var(--muted)] shadow-sm">
                        {dayLabel(msg.createdAt, hydrated)}
                      </span>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "group flex w-full",
                      own ? "justify-end" : "justify-start",
                      sameSenderPrev ? "mt-0.5" : "mt-2.5",
                      highlighted &&
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
                      {isGroup && !own && !sameSenderPrev ? <span className="mb-1 block w-fit rounded-full bg-[var(--surface)] px-2 py-1 text-[0.68rem] font-semibold text-[var(--accent-fg)]">{msg.sender.displayName}</span> : null}
                      {editing ? (
                        <div className="card-glass rounded-2xl p-2">
                          <textarea
                            value={editDraft}
                            onChange={(e) => actions.current?.editDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                actions.current?.saveEdit(msg.id);
                              }
                              if (e.key === "Escape") actions.current?.cancelEdit();
                            }}
                            rows={2}
                            autoFocus
                            className="field-input border-0! bg-transparent! p-2! text-sm"
                          />
                          <div className="flex justify-end gap-1.5 px-1 pb-1">
                            <button
                              type="button"
                              onClick={() => actions.current?.saveEdit(msg.id)}
                              disabled={busy}
                              className="btn btn-primary px-2.5! py-1.5! text-xs!"
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => actions.current?.cancelEdit()}
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
                              if (!deleted && !msg.selfDestruct) actions.current?.menu(msg);
                            }}
                            onSwipeRight={() => { if (!deleted && !msg.selfDestruct) { actions.current?.reply(msg); } }}
                            onSwipeLeft={() => { if (!deleted && !msg.selfDestruct) actions.current?.forward(msg); }}
                          >
                          <div
                            className={cn(
                              "chat-bubble inline-block max-w-full rounded-2xl px-3 py-2 text-left align-middle",
                              own
                                ? "rounded-br-md text-[var(--bubble-own-fg)]"
                                : "rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)]",
                              deleted && "opacity-70",
                            )}
                            style={
                              own
                                ? { background: "var(--bubble-own-bg)", "--muted": "var(--bubble-own-sub)", "--accent-fg": "var(--bubble-own-fg)" } as React.CSSProperties
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
                                onClick={() => actions.current?.jump(msg.replyTo!.id)}
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
                                            Message unavailable
                                          </span>
                                        ) : msg.replyTo.encrypted && replyText === undefined ? (
                                          <span className="flex items-center gap-1 opacity-70">
                                            {replyUnavailable ? "This reply is not available here. Check Profile for ways to get back into your chats." : "Opening reply…"}
                                          </span>
                                        ) : (
                                          <>
                                            <Quote className="mr-0.5 inline h-2.5 w-2.5 opacity-50" />
                                            {msg.replyTo.encrypted
                                              ? replyText ?? ""
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
                                {msg.selfDestruct ? "Message expired" : "Message deleted"}
                              </span>
                            ) : msg.selfDestruct && !own && !msg.text ? (
                              <button type="button" className="btn min-h-11 text-sm" disabled={!encryptionInitialized} onClick={() => actions.current?.reveal(msg)}>Reveal · disappears in 5 seconds</button>
                            ) : (
                              <>
                                {msg.selfDestruct ? <SelfDestructCountdown deadline={msg.expiresAt} offset={clockOffset} /> : null}
                                {msg.type === "audio" && msg.attachments.length > 0 ? (
                                  <div className="mb-1.5 min-w-0 max-w-full">
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
                                  <div className={cn(text && "mb-1.5")}>
                                    <AttachmentList
                                      messageId={msg.id}
                                      attachments={msg.attachments}
                                      own={own}
                                    />
                                  </div>
                                ) : null}
                                {msg.encrypted && Boolean(msg.text) && decryptedText === undefined ? (
                                  <EncryptedMessageState
                                    kind={msg.type}
                                    failed={unavailable}
                                    missingKey={missingKey}
                                    deviceError={deviceError} signal={msg.text === "signal:v2"}
                                    introduction={introduction}
                                    onRetry={() => actions.current?.retryDecrypt(msg.id)}
                                    onSecurity={() => { if (deviceError || msg.text === "signal:v2") actions.current?.deviceSettings(); else actions.current?.security(); }}
                                  />
                                ) : text ? (
                                  <MessageText text={text} />
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
                              <span>{timeLabel(msg.createdAt, hydrated)}</span>
                              {msg.starred ? <Star className="h-2.5 w-2.5 fill-current text-[var(--accent-fg)]" /> : null}
                              {own && !deleted ? (
                                msg.sendStatus === "failed" ? (
                                  <button type="button" onClick={() => actions.current?.retrySend(msg)} aria-label="Retry failed message">
                                    <ReceiptIcon message={msg} />
                                  </button>
                                ) : <ReceiptIcon message={msg} />
                              ) : null}
                            </span>
                          </div>
                          </LongPressTouchable>

                          {own && msg.sendStatus === "queued" ? (
                            <QueuedMessageNotice reason={msg.queueReason} onTry={() => { if (msg.queueReason?.includes("This device needs approval")) actions.current?.deviceSettings(); else actions.current?.retrySend(msg); }} onCancel={() => actions.current?.cancelQueued(msg)} />
                          ) : null}

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
                                  onClick={() => actions.current?.react(msg, r.emoji)}
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

                          {deleteMode !== undefined ? (
                            <span
                              className={cn(
                                "absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-1",
                                own ? "-left-16" : "-right-16",
                              )}
                            >
                              <button
                                type="button"
                                aria-label="Confirm delete"
                                onClick={() => actions.current?.delete(msg.id, deleteMode!)}
                                disabled={busy}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--danger)] text-white"
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel delete"
                                onClick={() => actions.current?.cancelDelete()}
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : (
                            <MessageActions
                              own={own}
                              deleted={deleted || Boolean(msg.selfDestruct)}
                              align={own ? "right" : "left"}
                              starred={msg.starred}
                              pinned={msg.pinned}
                              textAvailable={Boolean(copyableText)}
                              onReply={() => {
                                actions.current?.reply(msg);
                              }}
                              onReact={(emoji) => actions.current?.react(msg, emoji)}
                              onCopy={() => {
                                const t = copyableText;
                                if (t) actions.current?.copy(t);
                              }}
                              onForward={() => actions.current?.forward(msg)}
                              onReport={() => actions.current?.report(msg)}
                              onEdit={() => {
                                if (pendingDecrypt) return;
                                actions.current?.edit(msg);
                              }}
                              onStar={() => actions.current?.star(msg)}
                              onUnstar={() => actions.current?.star(msg)}
                              onPin={() => actions.current?.pin(msg)}
                              onUnpin={() => actions.current?.pin(msg)}
                              onDeleteForMe={() => {
                                actions.current?.delete(msg.id, "for_me");
                              }}
                              onDeleteForEveryone={() => actions.current?.requestDelete(msg.id)}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );

});
