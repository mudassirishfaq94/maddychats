"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { useRealtime } from "@/components/providers/realtime-provider";
import { activeAccount, chatLocked, offlineChats, type OfflineChat } from "../../../public/offline-store.js";
import { Avatar } from "@/components/avatar";
import { BellOff, Lock, Pin } from "lucide-react";
import { prepareSavedChatSnapshot } from "@/lib/saved-chat-snapshot";

const savedTime = new Intl.DateTimeFormat("en",{hour:"2-digit",minute:"2-digit",hour12:false});

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
      if (!stopped && activeAccount() === user.id) {
        setSaved({ scope: requestScope, chats });
        for (const chat of chats.slice(0, 3)) void prepareSavedChatSnapshot(user.id, requestScope, chat.id);
      }
    }).catch(() => undefined);
    return () => { stopped = true; remove(); window.removeEventListener("maddy:locked-chats", clear); window.removeEventListener("storage", clear); };
  }, [user, status, requestScope, subscribe]);
  const visible = user && status === "authenticated" && saved?.scope === requestScope && activeAccount() === user.id ? saved.chats : [];
  return <ul aria-label="Saved conversations" className="divide-y divide-[var(--border)]">
    {visible.filter(chat => !chat.archived && chat.name.toLowerCase().includes(filter.toLowerCase())).map(chat => {
      const locked = chat.locked || chatLocked(chat.id);
      const stamp=chat.lastMessageAt??chat.preview?.createdAt;
      const date=stamp?new Date(stamp):null;
      const preview=chat.requestPending?"Message request":chat.blocked?"Blocked":chat.preview?.kind==="message"?chat.preview.text:chat.preview?.kind==="ephemeral"?"Open to see messages":chat.preview?.kind==="deleted"?"Message deleted":chat.preview?.kind==="media"?"Media":"Open chat";
      return <li key={chat.id}><Link href={`/app/chats/${chat.id}`} prefetch={false}
        onPointerDown={() => onPrepare(chat.id)} onFocus={() => onPrepare(chat.id)}
        onNavigate={event => { event.preventDefault(); onOpen?.(chat.id); window.history.pushState(null, "", `/app/chats/${chat.id}`); }}
        className="chat-list-row flex min-h-[76px] min-w-0 items-center gap-3 px-4 py-3">
        {locked?<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]"><Lock className="h-5 w-5"/></span>:<Avatar user={{displayName:chat.name,username:chat.name,avatarUrl:chat.avatarUrl??null}} size={44}/>}
        <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5">{!locked&&chat.pinned?<Pin aria-label="Pinned" className="h-3 w-3 shrink-0 text-[var(--muted)]"/>:null}{!locked&&chat.muted?<BellOff aria-label="Muted" className="h-3 w-3 shrink-0 text-[var(--muted)]"/>:null}<span className="truncate text-[0.95rem] font-semibold tracking-[-0.01em]">{locked ? "Locked chat" : chat.name}</span></span>{!locked&&date&&Number.isFinite(date.getTime())?<time dateTime={stamp!} className="shrink-0 text-[0.66rem] tabular-nums text-[var(--muted)]">{savedTime.format(date)}</time>:null}</span>
        <span className="mt-1 flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 truncate text-[0.8rem] text-[var(--muted)]">{locked?"Unlock to open":preview}</span>{!locked&&(chat.unreadCount||chat.markedUnread)?<span aria-label={`${chat.unreadCount||1} unread`} className="flex h-[1.15rem] min-w-[1.15rem] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[0.64rem] font-bold text-white">{(chat.unreadCount??0)>99?"99+":chat.unreadCount||"•"}</span>:null}</span></span>
      </Link></li>;
    })}
  </ul>;
}
