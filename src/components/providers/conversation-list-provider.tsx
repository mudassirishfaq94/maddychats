"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ConversationSummary } from "@/lib/types";
import { createReconciledRead } from "@/lib/reconciled-read";
import { useAuth } from "./auth-provider";
import { useRealtime } from "./realtime-provider";

type Snapshot = { viewerId: string; conversations: ConversationSummary[] };
type ConversationList = {
  snapshot: Snapshot | null;
  seed: (conversations: ConversationSummary[]) => void;
  read: () => Promise<Snapshot>;
  refresh: () => Promise<Snapshot>;
};
const Context = createContext<ConversationList | null>(null);

function AccountConversationList({ userId, children }: { userId: string; children: ReactNode }) {
  const { connected, subscribe } = useRealtime();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [account] = useState(() => {
    let active = true;
    let current: Snapshot | null = null;
    let controller: AbortController | null = null;
    const reads = createReconciledRead<Snapshot>(async () => {
      if (!userId) throw new Error("Sign in to load conversations");
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/conversations", {
          cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw new Error("Conversation refresh failed");
        const data = await response.json() as Snapshot;
        if (data.viewerId !== userId || !Array.isArray(data.conversations)) throw new Error("Conversation account changed");
        request.signal.throwIfAborted();
        return data;
      } finally {
        if (controller === request) controller = null;
      }
    }, data => {
      if (active && data.viewerId === userId) { current = data; setSnapshot(data); }
    });
    return {
      reads,
      get current() { return current; },
      read() {
        return reads.pendingIsCurrent && reads.pending
          ? reads.pending
          : reads.pending ? reads.refresh() : current ? Promise.resolve(current) : reads.refresh();
      },
      setCurrent(value: Snapshot | null) { current = value; },
      setActive(value: boolean) { active = value; },
      abort() { controller?.abort(); },
    };
  });
  const { reads } = account;
  const refresh = useCallback(() => reads.refresh(), [reads]);
  const read = useCallback(() => account.read(), [account]);
  const seed = useCallback((conversations: ConversationSummary[]) => {
    // A prefetched tab may carry an older server snapshot than live state.
    // Keep current data visible and reconcile rather than overwriting it.
    if (account.current) { reads.invalidate(); void refresh().catch(() => undefined); return; }
    reads.invalidate();
    const data = { viewerId: userId, conversations };
    account.setCurrent(data);
    setSnapshot(data);
  }, [userId, reads, refresh, account]);

  useEffect(() => {
    account.setActive(true);
    reads.start();
    return () => {
      account.setActive(false);
      reads.stop();
      account.abort();
      account.setCurrent(null);
    };
  }, [account, reads]);
  useEffect(() => {
    // A reconnect invalidates any snapshot started before the transport came back.
    // The next refresh follows it, so recovery stays correct without overlap.
    if (userId && (connected || !account.current)) {
      if (connected) reads.invalidate();
      void refresh().catch(() => undefined);
    }
  }, [userId, connected, account, reads, refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const reconcile = () => {
      reads.invalidate();
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!stopped) void refresh().catch(() => undefined);
      }, 180);
    };
    const remove = subscribe(event => {
      if (!["message:new", "message:update", "message:deleted", "message:lifetime", "message:read",
        "message:deleted_for_me", "conversation:new", "conversation:delete", "group:updated",
        "group:member-added", "group:member-removed", "group:member-updated"].includes(event.type)) return;
      reconcile();
    });
    return () => { stopped = true; clearTimeout(timer); remove(); };
  }, [subscribe, reads, refresh]);
  const value = useMemo(() => ({ snapshot, seed, read, refresh }), [snapshot, seed, read, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function ConversationListProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <AccountConversationList key={user?.id ?? "signed-out"} userId={user?.id ?? ""}>{children}</AccountConversationList>;
}
export function useConversationList() {
  const value = useContext(Context);
  if (!value) throw new Error("ConversationListProvider is missing");
  return value;
}
