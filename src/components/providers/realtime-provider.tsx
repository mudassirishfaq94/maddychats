"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-provider";
import type { PresenceState, RealtimeEvent } from "@/lib/types";

type Listener = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  /** True while the SSE stream is open. EventSource auto-reconnects. */
  connected: boolean;
  /** Subscribe to every realtime event; returns an unsubscribe function. */
  subscribe: (listener: Listener) => () => void;
  /** Live presence for everyone sharing a conversation with the viewer. */
  presence: PresenceState;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Opens the Server-Sent Events stream whenever the user is authenticated and
 * fans events out to subscribers. Browser-native auto-reconnect covers
 * network blips; the stream itself re-verifies the session cookie on every
 * (re)connection, so logging out kills the channel server-side too.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceState>({});
  const listeners = useRef(new Set<Listener>());

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;

    const es = new EventSource("/api/realtime/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(e.data) as RealtimeEvent;
      } catch {
        return;
      }
      // Presence is centrally tracked so any component can read it.
      if (event.type === "presence:update") {
        setPresence((prev) => ({
          ...prev,
          [event.userId]: {
            online: event.online,
            lastSeenAt: event.lastSeenAt,
          },
        }));
      }
      listeners.current.forEach((fn) => {
        try {
          fn(event);
        } catch {
          // a broken subscriber must not sink the stream
        }
      });
    };

    return () => {
      es.close();
      setConnected(false);
      setPresence({});
    };
  }, [status]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ connected, subscribe, presence }),
    [connected, subscribe, presence],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}
