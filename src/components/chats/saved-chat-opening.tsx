"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useRealtime } from "@/components/providers/realtime-provider";
import { activeAccount, chatLocked, offlineChats, offlineHistory, type OfflineHistoryMessage } from "../../../public/offline-store.js";

/** Read-only transition surface. Sending and all server checks remain in ChatView. */
export function SavedChatOpening() {
  const { user, status, requestScope } = useAuth();
  const { subscribe } = useRealtime();
  const params = useParams<{ id?: string }>();
  const id = params.id;
  const [saved, setSaved] = useState<{ scope: object; id: string; name: string; messages: OfflineHistoryMessage[] } | null>(null);
  useEffect(() => {
    let stopped = false;
    if (!user || status !== "authenticated" || !id || activeAccount() !== user.id || chatLocked(id)) return;
    const clear = () => { stopped = true; setSaved(null); };
    const unsubscribe = subscribe(event => {
      // A fresh server event supersedes the transition snapshot immediately.
      if (event.type.startsWith("message:") || event.type.startsWith("conversation:") || event.type.startsWith("group:")) clear();
    });
    window.addEventListener("maddy:locked-chats", clear);
    window.addEventListener("storage", clear);
    void (async () => {
      const chat = (await offlineChats(user.id)).find(chat => chat.id === id);
      if (!chat || chat.locked || chat.blocked || chat.requestPending) return;
      const history = await offlineHistory(user.id, id);
      if (!stopped && activeAccount() === user.id && !chatLocked(id)) setSaved({
        scope: requestScope, id, name: chat.name,
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
  return <div className="flex h-full min-h-0 flex-col" aria-label="Opening conversation">
    <header className="border-b border-[var(--border)] px-4 py-3 font-semibold">{visible?.name ?? "Opening…"}</header>
    <div className="flex-1 overflow-y-auto p-4" aria-label="Saved messages">
      {visible?.messages.map(row => <p key={row.id} className="mb-3 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] px-4 py-2">{row.text}</p>)}
    </div>
  </div>;
}
