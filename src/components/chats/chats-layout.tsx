"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type * as React from "react";
import { Archive, BellOff, Pin, Search } from "lucide-react";
import type { ConversationSummary } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { LogoMark } from "@/components/brand/logo";
import { NewChatDialog } from "./new-chat-dialog";
import { ConversationMenu } from "./conversation-menu";
import { useRealtime } from "@/components/providers/realtime-provider";
import { cn, timeAgo } from "@/lib/utils";

function previewText(conv: ConversationSummary): string {
  const last = conv.lastMessage;
  if (!last) return "No messages yet";
  if (last.deletedAt) return "Message deleted";
  return last.text || "Attachment";
}

function stampTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff < 7) {
    return new Intl.DateTimeFormat("en", { weekday: "short" }).format(d);
  }
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(d);
}

/**
 * Chat-first three-area surface: conversation list · active conversation.
 * Full height underneath the app header — no cards, no dashboard chrome.
 */
export function ChatsLayout({
  conversations,
  children,
}: {
  conversations: ConversationSummary[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribe, presence } = useRealtime();
  const activeId = pathname.startsWith("/app/chats/")
    ? pathname.split("/")[3]
    : null;
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Live activity → debounced server refresh keeps previews ordered & fresh.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return subscribe((event) => {
      // Presence and typing already update through client state; refreshing
      // server components for those high-frequency events caused avoidable
      // network traffic and renders. Revalidate only persisted sidebar data.
      if (
        event.type !== "message:new" &&
        event.type !== "message:update" &&
        event.type !== "message:deleted" &&
        event.type !== "message:read" &&
        event.type !== "conversation:new" &&
        event.type !== "conversation:delete"
      ) {
        return;
      }
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 350);
    });
  }, [subscribe, router]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const archivedCount = useMemo(
    () => conversations.filter((c) => c.archived).length,
    [conversations],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return conversations
      .filter((c) => (showArchived ? c.archived : !c.archived))
      .filter((c) => {
        if (!q) return true;
        const name = c.name ?? c.otherMember?.displayName ?? "";
        const username = c.otherMember?.username ?? "";
        return (
          name.toLowerCase().includes(q) || username.toLowerCase().includes(q)
        );
      });
  }, [conversations, filter, showArchived]);

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden overflow-x-hidden bg-[var(--bg)]">
      {/* ------------------------ conversation sidebar ------------------------ */}
      <aside
        className={cn(
          "w-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:w-[340px]",
          activeId ? "hidden" : "flex",
        )}
        aria-label="Conversations"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <h1 className="font-display text-[1.15rem] font-bold">Chats</h1>
          <div className="flex items-center gap-1.5">
            <NewChatDialog start="group-people" />
            <NewChatDialog start="direct" />
          </div>
        </div>

        <div className="px-3.5 pb-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations…"
              aria-label="Search conversations"
              className="field-input field-input--icon rounded-full! py-2! text-sm!"
            />
          </div>
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

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
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
              {filtered.map((conv) => {
                const active = conv.id === activeId;
                const name =
                  conv.name ?? conv.otherMember?.displayName ?? "Unknown";
                return (
                  <li key={conv.id} className="group/row relative">
                    <Link
                      href={`/app/chats/${conv.id}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors duration-100",
                        active
                          ? "bg-[color-mix(in_srgb,var(--accent)_9%,transparent)]"
                          : "hover:bg-[color-mix(in_srgb,var(--muted)_7%,transparent)]",
                      )}
                    >
                      {conv.type === "group" && conv.avatarUrl ? (
                        <img src={conv.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                      ) : conv.otherMember ? (
                        <span className="relative shrink-0">
                          <Avatar user={conv.otherMember} size={44} />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface)]",
                              presence[conv.otherMember.id]?.online
                                ? "bg-[var(--accent)] pulse-dot"
                                : "bg-[var(--muted)] opacity-60",
                            )}
                          />
                        </span>
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
                          <LogoMark size={24} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {conv.pinned ? (
                              <Pin className="h-3 w-3 shrink-0 text-[var(--accent-fg)]" />
                            ) : null}
                            {conv.muted ? (
                              <BellOff className="h-3 w-3 shrink-0 text-[var(--muted)]" />
                            ) : null}
                            <span className="truncate text-[0.92rem] font-semibold">
                              {name}
                            </span>
                            {conv.requestPending ? <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-[var(--accent-fg)]">Request</span> : null}
                          </span>
                          <span className="shrink-0 text-[0.66rem] tabular-nums text-[var(--muted)]">
                            {stampTime(conv.lastMessageAt ?? conv.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span
                            className={cn(
                              "block flex-1 truncate text-[0.82rem]",
                              conv.unreadCount > 0 && !conv.muted
                                ? "font-medium text-[var(--text)]"
                                : "text-[var(--muted)]",
                              conv.lastMessage?.deletedAt && "italic",
                            )}
                          >
                            {previewText(conv)}
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
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                      <ConversationMenu conversation={conv} />
                    </span>
                  </li>
                );
              })}
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
            <h2 className="font-display mt-6 text-xl font-bold">Maddy Chats</h2>
            <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-[var(--muted)]">
              Select a conversation to start chatting.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
