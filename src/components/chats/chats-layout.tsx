"use client";

import Image from "next/image";
import { SwipeFilters } from "./swipe-filters";
import { useHydrated } from "@/hooks/use-hydrated";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { Archive, BellOff, Pin, Search, Star } from "lucide-react";
import type { ConversationSummary } from "@/lib/types";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { Avatar } from "@/components/avatar";
import { LogoMark } from "@/components/brand/logo";
import { NewChatDialog } from "./new-chat-dialog";
import { ConversationMenu } from "./conversation-menu";
import { usePresenceMap } from "@/components/providers/realtime-provider";
import { useConversationList } from "@/components/providers/conversation-list-provider";
import { mapWithConcurrency } from "@/lib/async";
import { cn, timeAgo } from "@/lib/utils";

// Warm JavaScript only: message history and server expiration timestamps must
// be read on navigation, rather than retained in a full-route prefetch.
let chatCode: Promise<unknown> | undefined;
function warmChatCode() {
  chatCode ??= import("./chat-view").catch(() => { chatCode = undefined; });
  return chatCode;
}

function previewText(conv: ConversationSummary, previews: Map<string, string>): string {
  const last = conv.lastMessage;
  if (!last) return "No messages yet";
  if (last.expiresAt && Date.parse(last.expiresAt)<=Date.now()) return "Message expired";
  if (last.deletedAt) return "Message deleted";
  if (last.encrypted) {
    // Ciphertext must never be shown as a preview.
    if (last.text) return previews.get(`${last.id}:${last.text}`) ?? "…";
  }
  return last.text || ({ audio: "Voice message", image: "Photo", video: "Video", file: "File" }[last.type] ?? "Message");
}

const utcStampFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const clockStampFormatter = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false });
const weekdayStampFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });
const dateStampFormatter = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
function stampTime(iso: string | null, hydrated: boolean): string {
  if (!iso) return "";
  if (!hydrated) return utcStampFormatter.format(new Date(iso));
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return clockStampFormatter.format(d);
  }
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff < 7) {
    return weekdayStampFormatter.format(d);
  }
  return dateStampFormatter.format(d);
}

const ConversationRow = memo(function ConversationRow({ conv, active, online, preview, timestamp }: {
  conv: ConversationSummary; active: boolean; online: boolean; preview: string; timestamp: string;
}) {
  const name = conv.name ?? conv.otherMember?.displayName ?? "Unknown";
  return (
    <li key={conv.id} className="group/row relative flex min-w-0 items-center border-b border-[var(--border)] last:border-b-0">
      <Link
        href={`/app/chats/${conv.id}`}
        prefetch={false}
        onPointerEnter={() => void warmChatCode()}
        onFocus={() => void warmChatCode()}
        onTouchStart={() => void warmChatCode()}
        aria-current={active ? "page" : undefined}
        className={cn(
          "chat-list-row flex min-h-[76px] min-w-0 flex-1 items-center gap-3 border-0 px-4 py-3 transition-colors duration-150",
          active
            ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[inset_3px_0_0_var(--accent)]"
            : "hover:bg-[var(--surface-2)]",
        )}
      >
        {conv.type === "group" && conv.avatarUrl ? (
          <Image unoptimized width={44} height={44} src={conv.avatarUrl} alt="Group photo" loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : conv.otherMember ? (
          <span className="relative shrink-0">
            <Avatar user={conv.otherMember} size={44} />
            <span
              aria-hidden="true"
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface)]",
                online
                  ? "bg-[var(--accent)] pulse-dot"
                  : "bg-[var(--muted)] opacity-60",
              )}
            />
          </span>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
            <LogoMark size={24} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {conv.pinned ? (
                <Pin className="h-3 w-3 shrink-0 text-[var(--accent-fg)]" />
              ) : null}
              {conv.favorited ? <Star className="h-3 w-3 shrink-0 fill-current text-[var(--accent-fg)]" /> : null}
              {conv.muted ? (
                <BellOff className="h-3 w-3 shrink-0 text-[var(--muted)]" />
              ) : null}
              <span className="truncate text-[0.95rem] font-semibold tracking-[-0.01em]">
                {name}
              </span>
              {conv.requestPending ? <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-[var(--accent-fg)]">Request</span> : null}
            </span>
            <span className="shrink-0 text-[0.66rem] tabular-nums text-[var(--muted)]">
                              {timestamp}
            </span>
          </span>
            <span className="mt-1 flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "block min-w-0 truncate text-[0.8rem]",
                conv.unreadCount > 0 && !conv.muted
                  ? "font-medium text-[var(--text)]"
                  : "text-[var(--muted)]",
                conv.lastMessage?.deletedAt && "italic",
              )}
            >
              {preview}
            </span>
            </span>
            {conv.unreadCount > 0 || conv.markedUnread ? (
              <span
                aria-label={`${conv.unreadCount || 1} unread`}
                className={cn(
                  "flex h-[1.15rem] min-w-[1.15rem] shrink-0 items-center justify-center rounded-full px-1 text-[0.64rem] font-bold text-white",
                  conv.muted && "opacity-50",
                )}
                style={{ background: "var(--accent)" }}
              >
                {conv.unreadCount > 0
                  ? conv.unreadCount > 99
                    ? "99+"
                    : conv.unreadCount
                  : "•"}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
      <span className="mr-1 shrink-0 transition-opacity sm:opacity-0 focus-within:opacity-100 group-hover/row:opacity-100">
        <ConversationMenu conversation={conv} />
      </span>
    </li>
  );
});

/**
 * Chat-first three-area surface: conversation list · active conversation.
 * Full height underneath the app header — no cards, no dashboard chrome.
 */
export function ChatsLayout({
  conversations: initialConversations,
  children,
}: {
  conversations: ConversationSummary[];
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  useEffect(() => {
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") void warmChatCode();
    }, 300);
    return () => clearTimeout(timer);
  }, []);
  const [liveList, setLiveList] = useState<{
    source: ConversationSummary[]; items: ConversationSummary[];
  } | null>(null);
  const { snapshot, seed } = useConversationList();
  useEffect(() => { seed(initialConversations); }, [initialConversations, seed]);
  const sourceConversations = snapshot?.conversations ?? initialConversations;
  const conversations = liveList?.source === sourceConversations
    ? liveList.items : sourceConversations;
  const { initialized, decrypt } = useSharedE2EE();
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const previewCache = useRef(previews);
  useEffect(() => { previewCache.current = previews; }, [previews]);
  useEffect(()=>{
    const pending=conversations.flatMap(conversation=>conversation.lastMessage?.expiresAt && !conversation.lastMessage.deletedAt ? [Date.parse(conversation.lastMessage.expiresAt)] : []);
    if(!pending.length)return;
    const expire=()=>{
      const now=Date.now();
      setLiveList({source:sourceConversations,items:conversations.map(conversation=>conversation.lastMessage?.expiresAt && Date.parse(conversation.lastMessage.expiresAt)<=now ? {...conversation,lastMessage:{...conversation.lastMessage,text:"",deletedAt:conversation.lastMessage.expiresAt}} : conversation)});
      setPreviews(current=>new Map([...current].filter(([key])=>!conversations.some(conversation=>conversation.lastMessage?.expiresAt && Date.parse(conversation.lastMessage.expiresAt)<=now && key.startsWith(`${conversation.lastMessage.id}:`)))));
    };
    const timer=setTimeout(expire,Math.min(2147483647,Math.max(0,Math.min(...pending)-Date.now()+1)));
    return()=>clearTimeout(timer);
  },[conversations,sourceConversations]);
  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    const pending = conversations.filter(c => c.lastMessage?.encrypted && c.lastMessage.text && !c.lastMessage.deletedAt && !previewCache.current.has(`${c.lastMessage.id}:${c.lastMessage.text}`));
    // Decrypting previews for every encrypted conversation at once fans out
    // unbounded crypto work onto the main thread as soon as the list renders.
    // Cap concurrency so the chat list stays responsive on a slow device.
    void mapWithConcurrency(pending, 4, async c => {
      const message = c.lastMessage!;
      const key = `${message.id}:${message.text}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const text = await decrypt(message.text, c.id);
          if (!cancelled) setPreviews(previous => new Map(previous).set(key, text));
          return;
        } catch {
          if (cancelled) return;
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      if (!cancelled) setPreviews(previous => new Map(previous).set(key, "Message unavailable"));
    });
    return () => { cancelled = true; };
  }, [conversations, initialized, decrypt]);
  const pathname = usePathname();
  const presence = usePresenceMap();
  const activeId = pathname.startsWith("/app/chats/")
    ? pathname.split("/")[3]
    : null;
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const [showArchived, setShowArchived] = useState(false);
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "favorites" | "groups" | "dms">("all");

  const archivedCount = useMemo(
    () => conversations.filter((c) => c.archived).length,
    [conversations],
  );

  const unreadCount = useMemo(
    () => conversations.filter((c) => !c.archived && (c.unreadCount > 0 || c.markedUnread)).length,
    [conversations],
  );
  const groupCount = useMemo(
    () => conversations.filter((c) => !c.archived && c.type === "group").length,
    [conversations],
  );
  const dmCount = useMemo(
    () => conversations.filter((c) => !c.archived && c.type === "dm").length,
    [conversations],
  );

  const filterChips: { key: typeof chatFilter; label: string; count: number; color?: string }[] = [
    { key: "all", label: "All", count: conversations.filter((c) => !c.archived).length },
    { key: "unread", label: "Unread", count: unreadCount, color: "var(--accent)" },
    { key: "favorites", label: "Favorites", count: conversations.filter((c) => !c.archived && c.favorited).length },
    { key: "groups", label: "Groups", count: groupCount },
    { key: "dms", label: "DMs", count: dmCount },
  ];

  const filtered = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase();
    return conversations
      .filter((c) => (showArchived ? c.archived : !c.archived))
      .filter((c) => {
        if (!q) return true;
        const name = c.name ?? c.otherMember?.displayName ?? "";
        const username = c.otherMember?.username ?? "";
        return (
          name.toLowerCase().includes(q) || username.toLowerCase().includes(q)
        );
      })
      .filter((c) => {
        if (chatFilter === "unread") return c.unreadCount > 0 || c.markedUnread;
        if (chatFilter === "favorites") return c.favorited;
        if (chatFilter === "groups") return c.type === "group";
        if (chatFilter === "dms") return c.type === "dm";
        return true;
      });
  }, [conversations, deferredFilter, showArchived, chatFilter]);

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden overflow-x-hidden bg-[var(--bg)]">
      {/* ------------------------ conversation sidebar ------------------------ */}
      <aside
        className={cn(
          "relative min-w-0 w-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:w-[360px] xl:w-[380px]",
          activeId ? "hidden" : "flex",
        )}
        aria-label="Conversations"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">Chats</h1>
          <div className="flex shrink-0 items-center gap-1">
        <Link href="/help" aria-label="Open Circlo Help" title="Circlo Help" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--accent-fg)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
          <LogoMark size={26} />
          <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">?</span>
        </Link>
            <NewChatDialog start="group-people" compact />
            <NewChatDialog start="direct" compact />
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations…"
              aria-label="Search conversations"
              className="field-input field-input--icon min-h-11 rounded-xl! py-2! text-sm!"
            />
          </div>
          <SwipeFilters>
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setChatFilter(chip.key)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-medium transition-colors",
                  chatFilter === chip.key
                    ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)]",
                )}
              >
                {chip.label}
                {chip.count > 0 && chip.key !== "all" ? (
                  <span className="ml-1 text-[0.6rem] opacity-70">{chip.count}</span>
                ) : null}
              </button>
            ))}
          </SwipeFilters>
          {archivedCount > 0 || showArchived ? (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-1 text-[0.72rem] font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              <Archive className="h-3 w-3" />
              {showArchived
                ? "Back to active chats"
                : `Archived (${archivedCount})`}
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-2">
          {conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <LogoMark size={30} className="text-[var(--muted)]" />
              <p className="mt-4 text-sm font-semibold">No conversations yet</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                Start one from the button above or from someone&apos;s profile.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--muted)]">
              No chats match &ldquo;{filter}&rdquo;.
            </p>
          ) : (
            <ul>
              {filtered.map(conv => <ConversationRow
                key={conv.id} conv={conv} active={conv.id === activeId}
                timestamp={stampTime(conv.lastMessageAt ?? conv.createdAt, hydrated)}
                online={Boolean(conv.otherMember && presence[conv.otherMember.id]?.online)}
                preview={previewText(conv, previews)}
              />)}
            </ul>
          )}
        </div>

      </aside>

      {/* ------------------------------ chat area ------------------------------ */}
      <section
        className={cn("min-w-0 flex-1 flex-col lg:flex", activeId ? "flex" : "hidden")}
        aria-label="Conversation"
      >
        {activeId ? (
          children
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <LogoMark size={54} className="text-[var(--text)]" />
            <h2 className="font-display mt-6 text-xl font-bold">Your conversations live here.</h2>
            <p className="mt-1 text-xs text-[var(--accent-fg)]">Circlo · your people, your conversations.</p>
            <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-[var(--muted)]">
              Select a conversation to start chatting.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
