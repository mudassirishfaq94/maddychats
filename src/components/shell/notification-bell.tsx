"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2, MessageCircle, Info } from "lucide-react";
import type { NotificationDTO } from "@/lib/types";
import { useRealtime } from "@/components/providers/realtime-provider";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Notification bell with a persisted unread count (PostgreSQL is the source
 * of truth) and live `notification:new` events.
 */
export function NotificationBell() {
  const router = useRouter();
  const { subscribe } = useRealtime();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications?limit=25", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          notifications: NotificationDTO[];
          unreadCount: number;
        };
      })
      .then((data) => {
        if (!data) return;
        setItems(data.notifications);
        setUnread(data.unreadCount);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  // Live updates.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "notification:new") {
        setItems((prev) => [event.notification, ...prev].slice(0, 25));
        setUnread((n) => n + 1);
      }
    });
  }, [subscribe]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", { method: "PATCH" }).catch(() => null);
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
  }

  async function openNotification(n: NotificationDTO) {
    if (!n.readAt) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(
        () => null,
      );
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      setUnread((v) => Math.max(0, v - 1));
    }
    const convId = n.data?.conversationId as string | undefined;
    const msgId = n.data?.messageId as string | undefined;
    setOpen(false);
    if (convId) {
      router.push(
        `/app/chats/${convId}${msgId ? `?message=${msgId}` : ""}`,
      );
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-all hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="card-glass fixed left-2 right-2 top-16 z-50 w-auto max-w-none overflow-hidden rounded-2xl animate-fade-up sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-80 sm:max-w-[calc(100vw-1.25rem)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:opacity-80"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(20rem,calc(100dvh-9rem))] overflow-y-auto p-1.5">
            {loading && items.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                You&apos;re all caught up.
              </p>
            ) : (
              items.map((n) => {
                const Icon = n.type === "message" ? MessageCircle : Info;
                const actor = (n.data?.actorName as string) ?? "Someone";
                const preview =
                  (n.data?.preview as string) ??
                  (n.data?.message as string) ??
                  "";
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void openNotification(n)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--muted)_9%,transparent)]",
                      !n.readAt && "bg-[color-mix(in_srgb,var(--accent)_9%,transparent)]",
                    )}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]">
                      <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">
                        {n.type === "message" ? `${actor} sent a message` : "System"}
                      </span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {preview}
                      </span>
                      <span className="mt-0.5 block text-[0.65rem] text-[var(--muted)] opacity-80">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    {!n.readAt ? (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          <Link
            href="/app/chats"
            onClick={() => setOpen(false)}
            className="block border-t border-[var(--border)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--accent)] hover:opacity-80"
          >
            Open chats
          </Link>
        </div>
      ) : null}
    </div>
  );
}
