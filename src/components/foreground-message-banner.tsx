"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useRealtime, useNotificationPreferences } from "@/components/providers/realtime-provider";
import type { NotificationDTO } from "@/lib/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ForegroundMessageBanner() {
  const { subscribe } = useRealtime();
  const { user } = useAuth(); const userId = user?.id;
  const pathname = usePathname();
  const preferences = useNotificationPreferences();
  const [notice, setNotice] = useState<(NotificationDTO & { ownerId: string | undefined; screen: string }) | null>(null);
  useEffect(() => {
    return subscribe(event => {
      if (event.type !== "notification:new" || event.notification.type !== "message" || document.visibilityState !== "visible") return;
      const id = event.notification.data?.conversationId;
      const message = event.notification.data?.messageId;
      if (typeof id !== "string" || !uuid.test(id) || typeof message !== "string" || !uuid.test(message) || pathname === `/app/chats/${id}`) return;
      setNotice({ ...event.notification, ownerId: userId, screen: pathname });
    });
  }, [subscribe, pathname, userId]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 6500); return () => clearTimeout(timer); }, [notice]);
  if (!notice || notice.ownerId !== userId || notice.screen !== pathname) return null;
  // The banner is a notification too: it names the sender only when the user
  // asked for notification details.
  const showDetails = preferences?.showNotificationDetails === true;
  const actor = showDetails && typeof notice.data?.actorName === "string" ? notice.data.actorName : "Circlo";
  const summary = showDetails && typeof notice.data?.preview === "string" ? notice.data.preview : "New message · Open chat";
  return <aside role="status" aria-label="New message notification" className="fixed inset-x-3 top-[max(7rem,env(safe-area-inset-top))] z-[150] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl">
    <MessageCircle className="h-5 w-5 shrink-0 text-[var(--accent)]" />
    <Link onClick={() => setNotice(null)} href={`/app/chats/${notice.data!.conversationId}?message=${notice.data!.messageId}`} className="min-h-11 min-w-0 flex-1 py-1"><span className="block truncate text-sm font-semibold">{actor}</span><span className="block text-xs text-[var(--muted)]">{summary}</span></Link>
    <button type="button" aria-label="Dismiss message notification" onClick={() => setNotice(null)} className="flex h-11 w-11 shrink-0 items-center justify-center"><X className="h-4 w-4" /></button>
  </aside>;
}
