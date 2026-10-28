"use client";

import type { CurrentChatPreview } from "@/lib/current-chat-preview";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
  const [invalidated, setInvalidated] = useState<{scope: object; id: string} | null>(null);
  const previewLive = usePreviewDeadline(preview?.deadline);
  const [saved, setSaved] = useState<{ scope: object; id: string; name: string; messages: OfflineHistoryMessage[] } | null>(null);
  useEffect(() => {
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
  const current = user && status === "authenticated" && preview?.scope === requestScope && preview.userId === user.id && preview.conversationId === id && !chatLocked(preview.conversationId) && !(invalidated?.scope === requestScope && invalidated.id === id) && previewLive ? preview : null;
  return <div className="flex h-full min-h-0 flex-col" aria-label="Opening conversation">
    <header className="border-b border-[var(--border)] px-4 py-3 font-semibold">{current?.name ?? visible?.name ?? "Opening…"}</header>
    <div className="flex-1 overflow-y-auto p-4" aria-label="Saved messages">
      {current && !visible?.messages.some(row => row.id === current.messageId) ? <p className="mb-3 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] px-4 py-2">{current.text}</p> : null}
      {visible?.messages.map(row => <p key={row.id} className="mb-3 whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-2)] px-4 py-2">{row.text}</p>)}
    </div>
  </div>;
}
