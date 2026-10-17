"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { LOCKED_CHATS_KEY, resolveLocalNotification } from "@/lib/local-notification-preview";
import { useRealtime } from "@/components/providers/realtime-provider";
import type { NotificationDTO } from "@/lib/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ForegroundMessageBanner() {
  const { subscribe } = useRealtime();
  const { user } = useAuth(); const userId = user?.id;
  const pathname = usePathname();
  const { decrypt } = useSharedE2EE();
  const [notice, setNotice] = useState<(NotificationDTO & { ownerId: string | undefined; screen: string; title: string; body: string }) | null>(null);
  useEffect(() => {
    let active = true;
    let epoch = 0;
    const clear = () => { epoch++; setNotice(null); };
    window.addEventListener("maddy:locked-chats", clear);
    window.addEventListener("maddy:notification-preferences", clear);
    const storageChanged = (event: StorageEvent) => { if (event.key === null || event.key === LOCKED_CHATS_KEY) clear(); };
    window.addEventListener("storage", storageChanged);
    const unsubscribe = subscribe(event => {
      if (event.type !== "notification:new" || event.notification.type !== "message" || document.visibilityState !== "visible") return;
      const id = event.notification.data?.conversationId;
      const message = event.notification.data?.messageId;
      if (typeof id !== "string" || !uuid.test(id) || typeof message !== "string" || !uuid.test(message) || pathname === `/app/chats/${id}`) return;
      if (!userId) return;
      const version = ++epoch;
      void resolveLocalNotification(event.notification.id, userId, decrypt, () => active && epoch === version).then(detail => {
        if (detail && active && epoch === version) setNotice({ ...event.notification, ownerId: userId, screen: pathname, title: detail.title, body: detail.body });
      }).catch(() => {});
    });
    return () => {
      active = false; unsubscribe();
      window.removeEventListener("maddy:locked-chats", clear);
      window.removeEventListener("maddy:notification-preferences", clear);
      window.removeEventListener("storage", storageChanged);
    };
  }, [subscribe, pathname, userId, decrypt]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 6500); return () => clearTimeout(timer); }, [notice]);
  if (!notice || notice.ownerId !== userId || notice.screen !== pathname) return null;
  const actor = notice.title;
  const summary = notice.body;
  return <aside role="status" aria-label="New message notification" className="fixed inset-x-3 top-[max(7rem,env(safe-area-inset-top))] z-[150] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
    <MessageCircle className="h-5 w-5 shrink-0 text-[var(--accent)]" />
    <Link onClick={() => setNotice(null)} href={`/app/chats/${notice.data!.conversationId}?message=${notice.data!.messageId}`} className="min-h-11 min-w-0 flex-1 py-1"><span className="block truncate text-sm font-semibold">{actor}</span><span className="block text-xs text-[var(--muted)]">{summary}</span></Link>
    <button type="button" aria-label="Dismiss message notification" onClick={() => setNotice(null)} className="flex h-11 w-11 shrink-0 items-center justify-center"><X className="h-4 w-4" /></button>
  </aside>;
}
