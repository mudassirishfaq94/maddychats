"use client";

import type { CurrentChatPreview } from "@/lib/current-chat-preview";
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronLeft, Lock, MoreVertical, Phone } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useRealtime } from "@/components/providers/realtime-provider";
import { activeAccount, chatLocked, offlineChats, offlineHistory, type OfflineHistoryMessage } from "../../../public/offline-store.js";

function usePreviewDeadline(deadline: number | null | undefined) {
  const subscribe = useCallback((notify: () => void) => {
    if (deadline === null || deadline === undefined) return () => {};
    const timer = setTimeout(notify, Math.min(2147483647, Math.max(0, deadline-performance.now())));
    document.addEventListener("visibilitychange",notify);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange",notify); };
  },[deadline]);
  const current = useCallback(() => deadline === null || (deadline !== undefined && deadline > performance.now()),[deadline]);
  return useSyncExternalStore(subscribe,current,() => false);
}

/** Read-only transition surface. Sending and all server checks remain in ChatView. */
export function SavedChatOpening({ conversationId, preview }: { conversationId?: string; preview?: CurrentChatPreview } = {}) {
  const { user, status, requestScope } = useAuth();
  const { subscribe } = useRealtime();
  const params = useParams<{ id?: string }>();
  const id = conversationId ?? params.id;
  const viewport=useRef<HTMLDivElement>(null);
  const followLatest=useRef(true);
  const [invalidated, setInvalidated] = useState<{scope: object; id: string} | null>(null);
  const previewLive = usePreviewDeadline(preview?.deadline);
  const [saved, setSaved] = useState<{ scope: object; id: string; name: string; avatarUrl?:string|null; messages: OfflineHistoryMessage[] } | null>(null);
  useLayoutEffect(() => {
    let stopped = false;
    if (!user || status !== "authenticated" || !id || chatLocked(id)) return;
    const clear = () => { stopped = true; setSaved(null); setInvalidated({scope: requestScope,id}); };
    const unsubscribe = subscribe(event => {
      // New messages and read receipts do not invalidate the saved history.
      // Edits, deletion, lifetime or access changes do: never leave a revoked
      // or changed row visible while its authorized replacement is loading.
      const invalidates = ["message:update", "message:deleted", "message:deleted_for_me", "message:lifetime", "conversation:delete"].includes(event.type) || event.type.startsWith("group:");
      const affected = "conversationId" in event ? event.conversationId : undefined;
      if (invalidates && (!affected || affected === id)) clear();
    });
    window.addEventListener("maddy:locked-chats", clear);
    window.addEventListener("storage", clear);
    void (async () => {
      if (activeAccount() !== user.id) return;
      const chat = (await offlineChats(user.id)).find(chat => chat.id === id);
      if (!chat || chat.locked || chat.blocked || chat.requestPending) return;
      const history = await offlineHistory(user.id, id);
      if (!stopped && activeAccount() === user.id && !chatLocked(id)) setSaved({
        scope: requestScope, id, name: chat.name, avatarUrl:chat.avatarUrl,
        messages: history.messages.filter(row => row.kind === "message"),
      });
    })().catch(() => undefined);
    return () => {
      stopped = true; unsubscribe();
      window.removeEventListener("maddy:locked-chats", clear);
      window.removeEventListener("storage", clear);
    };
  }, [user, status, id, requestScope, subscribe]);
  const visible = status === "authenticated" && user && id && saved?.scope === requestScope && saved.id === id
    && activeAccount() === user.id && !chatLocked(id) ? saved : null;
  const current = user && status === "authenticated" && preview?.scope === requestScope && preview.userId === user.id && preview.conversationId === id && !chatLocked(preview.conversationId) && !(invalidated?.scope === requestScope && invalidated.id === id) && previewLive ? preview : null;
  const name=current?.name??visible?.name??"Opening…";
  useLayoutEffect(()=>{if(viewport.current&&followLatest.current)viewport.current.scrollTop=viewport.current.scrollHeight;},[visible,current]);
  const bubble=(row:{id:string;text:string;mine?:boolean;createdAt?:string})=><div key={row.id} className={`mt-2.5 flex w-full ${row.mine?"justify-end":"justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.875rem] ${row.mine?"rounded-br-md bg-[var(--bubble-own-bg)] text-[var(--bubble-own-fg)]":"rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)]"}`}><p className="whitespace-pre-wrap break-words">{row.text}</p><div className="mt-1 h-3 text-right text-[0.6rem] text-[var(--muted)]">{row.createdAt&&Number.isFinite(Date.parse(row.createdAt))?new Date(row.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:false}):null}</div></div></div>;
  return <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]" aria-label="Opening conversation">
    <header className="flex h-14 min-w-0 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-2 sm:gap-3 sm:px-4"><Link href="/app/chats" aria-label="Back to chats" className="flex h-11 w-11 shrink-0 items-center justify-center lg:hidden"><ChevronLeft className="h-5 w-5"/></Link><Avatar user={{displayName:name,username:name,avatarUrl:visible?.avatarUrl??null}} size={36}/><span className="min-w-0 flex-1 truncate text-[0.92rem] font-semibold">{name}</span><span aria-hidden="true" className="flex items-center gap-4 px-3 text-[var(--muted)]"><Phone className="h-5 w-5"/><Lock className="h-4 w-4"/><MoreVertical className="h-5 w-5"/></span></header>
    <div ref={viewport} className="min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-label="Saved messages" onWheel={event=>{if(event.deltaY<0)followLatest.current=false;}} onTouchStart={()=>{followLatest.current=false;}}>
      <div className="flex min-h-full flex-col justify-end">
      {visible?.messages.map(bubble)}
      {current && !visible?.messages.some(row => row.id === current.messageId) ? bubble({id:current.messageId,text:current.text,mine:current.mine,createdAt:current.createdAt}) : null}
      </div>
    </div>
    <div aria-hidden="true" className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"><div className="flex h-14 items-center rounded-[24px] bg-[var(--input-bg)] px-4 text-sm text-[var(--muted)]">Message…</div></div>
  </div>;
}
