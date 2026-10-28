"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { useRealtime } from "@/components/providers/realtime-provider";
import { activeAccount, chatLocked, offlineChats, type OfflineChat } from "../../../public/offline-store.js";

/** Read-only local rows until the authorized conversation refresh replaces them. */
export function SavedInboxList({ filter, onPrepare, onOpen }: { filter: string; onPrepare: (id: string) => void; onOpen?: (id:string)=>void }) {
  const { user, status, requestScope } = useAuth();
  const { subscribe } = useRealtime();
  const [saved, setSaved] = useState<{ scope: object; chats: OfflineChat[] } | null>(null);
  useEffect(() => {
    let stopped = false;
    if (!user || status !== "authenticated" || activeAccount() !== user.id) return;
    const clear = () => { stopped = true; setSaved(null); };
    const remove = subscribe(event => {
      if (["conversation:delete", "group:member-removed", "message:deleted", "message:deleted_for_me", "message:lifetime"].includes(event.type)) clear();
    });
    window.addEventListener("maddy:locked-chats", clear);
    window.addEventListener("storage", clear);
    void offlineChats(user.id).then(chats => {
      if (!stopped && activeAccount() === user.id) setSaved({ scope: requestScope, chats });
    }).catch(() => undefined);
    return () => { stopped = true; remove(); window.removeEventListener("maddy:locked-chats", clear); window.removeEventListener("storage", clear); };
  }, [user, status, requestScope, subscribe]);
  const visible = user && status === "authenticated" && saved?.scope === requestScope && activeAccount() === user.id ? saved.chats : [];
  return <ul aria-label="Saved conversations" className="divide-y divide-[var(--border)]">
    {visible.filter(chat => !chat.archived && chat.name.toLowerCase().includes(filter.toLowerCase())).map(chat => {
      const locked = chat.locked || chatLocked(chat.id);
      return <li key={chat.id}><Link href={`/app/chats/${chat.id}`} prefetch={false}
        onPointerDown={() => onPrepare(chat.id)} onFocus={() => onPrepare(chat.id)}
        onNavigate={event => { event.preventDefault(); onOpen?.(chat.id); window.history.pushState(null, "", `/app/chats/${chat.id}`); }}
        className="chat-list-row flex min-h-[76px] min-w-0 flex-col justify-center gap-1 px-4 py-3">
        <span className="truncate font-semibold">{locked ? "Locked chat" : chat.name}</span>
        {!locked && !chat.blocked && !chat.requestPending && chat.preview?.kind === "message" ? <span className="truncate text-sm text-[var(--muted)]">{chat.preview.text}</span> : null}
      </Link></li>;
    })}
  </ul>;
}
