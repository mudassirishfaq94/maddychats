"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConversationSummary } from "@/lib/types";
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
  const current = useRef<Snapshot | null>(null);
  const pending = useRef<Promise<Snapshot> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  const refresh = useCallback((): Promise<Snapshot> => {
    if (pending.current) return pending.current;
    const request = new AbortController();
    controller.current = request;
    const load = (async () => {
      const response = await fetch("/api/conversations", {
        cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) throw new Error("Conversation refresh failed");
      const data = await response.json() as Snapshot;
      if (data.viewerId !== userId || !Array.isArray(data.conversations)) throw new Error("Conversation account changed");
      request.signal.throwIfAborted();
      if (active.current) { current.current = data; setSnapshot(data); }
      return data;
    })();
    pending.current = load;
    void load.finally(() => {
      if (pending.current === load) pending.current = null;
    }).catch(() => undefined);
    return load;
  }, [userId]);
  const read = useCallback(() => pending.current ?? (current.current ? Promise.resolve(current.current) : refresh()), [refresh]);
  const seed = useCallback((conversations: ConversationSummary[]) => {
    const data = { viewerId: userId, conversations };
    current.current = data;
    setSnapshot(data);
  }, [userId]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); current.current = null; };
  }, []);
  useEffect(() => {
    // Server-rendered list seeds arrive before this parent's passive effect.
    // Reconcile after stream connection to cover the SSR-to-SSE gap.
    if (connected || !current.current) void refresh().catch(() => undefined);
  }, [connected, refresh]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const reconcile = () => {
      if (!dirty || !active.current) return;
      dirty = false;
      void refresh().catch(() => undefined).finally(() => {
        // A persisted event during an in-flight request needs a later snapshot.
        if (dirty && active.current) timer = setTimeout(reconcile, 180);
      });
    };
    const remove = subscribe(event => {
      if (!["message:new", "message:update", "message:deleted", "message:lifetime", "message:read",
        "message:deleted_for_me", "conversation:new", "conversation:delete", "group:updated",
        "group:member-added", "group:member-removed", "group:member-updated"].includes(event.type)) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(reconcile, 180);
    });
    return () => { clearTimeout(timer); remove(); };
  }, [subscribe, refresh]);
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
