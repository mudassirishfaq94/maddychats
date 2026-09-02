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

interface NotificationPreferences {
  pushNotifications: boolean;
  notificationSound: boolean;
}

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
  const { status, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceState>({});
  const listeners = useRef(new Set<Listener>());
  const notificationPreferences = useRef<NotificationPreferences | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const playNotificationSound = useCallback(() => {
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = audioContext.current ?? new AudioContextClass();
    audioContext.current = context;
    if (context.state !== "running") return;
    const start = context.currentTime;
    for (const [frequency, offset] of [[880, 0], [1174.66, 0.11]] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.17);
    }
  }, []);

  // Browsers allow sound only after a gesture. Prime audio on the first
  // interaction so later messages can chime while the window is hidden.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  useEffect(() => {
    const unlock = () => {
      const AudioContextClass = window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = audioContext.current ?? new AudioContextClass();
      audioContext.current = context;
      void context.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    void fetch("/api/notifications/preferences", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { preferences?: NotificationPreferences } | null) => {
        if (data?.preferences) notificationPreferences.current = data.preferences;
      })
      .catch(() => undefined);
    const update = (event: Event) => {
      notificationPreferences.current = (event as CustomEvent<NotificationPreferences>).detail;
    };
    window.addEventListener("maddy:notification-preferences", update);
    return () => {
      controller.abort();
      window.removeEventListener("maddy:notification-preferences", update);
    };
  }, [status]);

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
      if (event.type === "notification:new" && event.notification.type === "message") {
        const preferences = notificationPreferences.current;
        const data = event.notification.data;
        const actor = String(data?.actorName ?? "Someone");
        const preview = String(data?.preview ?? "New message");
        const conversationId = String(data?.conversationId ?? "");
        const messageId = String(data?.messageId ?? "");

        if (preferences?.notificationSound) playNotificationSound();
        if (
          preferences?.pushNotifications &&
          localStorage.getItem("maddy:web-push-subscribed") !== "1" &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          (document.visibilityState === "hidden" || !document.hasFocus())
        ) {
          const title = `${actor} sent a message`;
          const url = `/app/chats/${conversationId}${messageId ? `?message=${messageId}` : ""}`;
          const options: NotificationOptions = {
            body: preview,
            tag: `maddy-message-${messageId || event.notification.id}`,
            icon: "/icons/maddy-192.png",
            badge: "/icons/maddy-192.png",
            data: { url },
          };
          if ("serviceWorker" in navigator) {
            void navigator.serviceWorker.ready.then((registration) =>
              registration.showNotification(title, options),
            );
          } else {
            const notification = new Notification(title, options);
            notification.onclick = () => {
              window.focus();
              window.location.href = url;
              notification.close();
            };
          }
        }
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
  }, [playNotificationSound, status, user?.id]);

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
