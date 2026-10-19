"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { useSharedE2EE } from "./e2ee-provider";
import { activeAccount, rememberChats, offlineChats, forgetHistory, rememberHistory, queuedTexts, removeText, type OfflineText } from "../../../public/offline-store.js";
import { loadChatDraft, saveChatDraft } from "@/lib/chat-outbox";
import type { ConversationSummary } from "@/lib/types";
import { useRealtime } from "./realtime-provider";
import { offlineHistoryRows } from "@/lib/offline-history";
import { notificationLockedChatIds } from "@/lib/local-notification-preview";
import { claimQueuedSend } from "@/lib/queued-send-claim";

/** Revalidate account, membership and encryption on device before every retry. */
export function OfflineComposeProvider() {
  const { user } = useAuth();
  const encryption = useSharedE2EE();
  const { subscribe } = useRealtime();
  const current = useRef({ user, encryption });
  useEffect(() => { current.current = { user, encryption }; });
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!user) return;
    let stopped = false, running = false;
    const refreshChats = async () => {
      try {
        const response = await fetch("/api/conversations", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok || stopped) return;
        const data = await response.json() as { conversations: ConversationSummary[]; viewerId: string };
        if(data.viewerId!==user.id)return;
        const locked = notificationLockedChatIds();
        const chats = data.conversations.map(c => locked === null || locked.includes(c.id)
          ? {id:c.id,name:"Locked chat",locked:true}
          : {id:c.id,name:c.name??c.otherMember?.displayName??"Chat",type:c.type,unreadCount:c.unreadCount,favorited:c.favorited,pinned:c.pinned,archived:c.archived,lastMessageAt:c.lastMessageAt,blocked:c.blocked,requestPending:c.requestPending});
        for (const old of await offlineChats(user.id)) if (!chats.some(chat => chat.id === old.id) || locked === null || locked.includes(old.id)) await forgetHistory(user.id,old.id);
        if (!stopped && current.current.user?.id === user.id) await rememberChats(user.id, chats);
      } catch { /* Keep the last encrypted contact list during a network outage. */ }
    };
    const run = async () => {
      if (running || stopped || !navigator.onLine || !current.current.encryption.initialized) return;
      running = true;
      try {
        const entries = await queuedTexts(user.id);
        for (const entry of entries) {
          if(entry.failed)continue;
          if (stopped || current.current.user?.id !== user.id) return;
          const locked = notificationLockedChatIds();
          if (locked === null || locked.includes(entry.conversationId)) { setStatus("Unlock the chat to send its queued message."); continue; }
          const auth = await fetch("/api/auth/me", { cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (!auth.ok || (await auth.json()).user?.id !== user.id) { setStatus("Sign in to send queued messages."); return; }
          const prepared = await current.current.encryption.prepareConversation(entry.conversationId);
          if (!prepared.ready || prepared.trustChanged || prepared.missingPeers) { setStatus("Queued message is waiting for secure delivery."); continue; }
          await send(entry);
        }
      } catch { if (!stopped) setStatus("Connection unavailable. Your queued messages are saved."); }
      finally { running = false; }
    };
    const send = async (entry: OfflineText) => {
      const releaseSend = claimQueuedSend(user.id, entry.id);
      if (!releaseSend) return;
      try {
      const text = await current.current.encryption.encrypt(entry.text, entry.conversationId);
      if (stopped || current.current.user?.id !== user.id || (entry.source === "offline" && activeAccount() !== user.id)) return;
      if (!(await queuedTexts(user.id)).some(item => item.id === entry.id)) return;
      if (notificationLockedChatIds()?.includes(entry.conversationId) !== false) return;
      const response = await fetch(`/api/conversations/${entry.conversationId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ clientMessageId: entry.id, expectedSenderId: user.id, text, encrypted: true, replyToMessageId: entry.replyToMessageId }),
      });
      if (!response.ok) { setStatus("A queued message needs attention. Reopen its chat or retry after reconnecting."); return; }
      const data = await response.json();
      if (!data.message?.id) throw new Error("Missing server acknowledgment");
      await rememberHistory(user.id,entry.conversationId,offlineHistoryRows([data.message],new Map([[data.message.id,entry.text]]),user.id));
      await removeText(user.id, entry.id);
      if ((await loadChatDraft(user.id, entry.conversationId))?.trim() === entry.text.trim()) await saveChatDraft(user.id, entry.conversationId, "");
      setStatus("Queued message sent.");
      } finally { releaseSend(); }
    };
    const resume = () => { void run(); };
    const refresh = () => { void refreshChats(); void run(); };
    void refreshChats(); resume();
    let listTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe(event => {
      if (event.type.startsWith("conversation:") || event.type.startsWith("group:")) { clearTimeout(listTimer); listTimer=setTimeout(()=>void refreshChats(),180); return; }
      if(event.type==="message:deleted_for_me"){void rememberHistory(user.id,event.conversationId,[],false,[event.messageId]).catch(()=>{});return;}
      if (event.type !== "message:new" && event.type !== "message:update" && event.type !== "message:deleted") return;
      const {message,conversationId}=event;
      if(notificationLockedChatIds()?.includes(conversationId)!==false)return;
      void (async()=>{
        const summary=(await offlineChats(user.id)).find(chat=>chat.id===conversationId);
        if(!summary || summary.requestPending || summary.locked)return;
        const plain=new Map<string,string>();
        if(message.encrypted && !message.deletedAt && !message.selfDestruct && !message.expiresAt) {
          try { plain.set(message.id,await current.current.encryption.decrypt(message.text,conversationId)); } catch { return; }
        }
        if(!stopped)await rememberHistory(user.id,conversationId,offlineHistoryRows([message],plain,user.id));
      })().catch(()=>{});
    });
    const timer = window.setInterval(resume, 10000);
    window.addEventListener("online", refresh); window.addEventListener("focus", refresh);
    window.addEventListener("maddy:locked-chats", refresh); window.addEventListener("storage", refresh);
    return () => { stopped = true; unsubscribe(); clearTimeout(listTimer); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("maddy:locked-chats", refresh); window.removeEventListener("storage", refresh); };
  }, [user, encryption.initialized, subscribe]);
  return status ? <div role="status" className="fixed bottom-24 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-lg">{status}{status !== "Queued message sent." ? <a href="/offline.html?queue=1" className="ml-3 inline-flex min-h-11 items-center font-semibold underline">Review queue</a> : null}</div> : null;
}
