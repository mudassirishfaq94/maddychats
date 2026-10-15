"use client";

import { navigateWithReload } from "@/lib/navigation";
import { useRouter } from "next/navigation";

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
import { isNativeApp } from "@/lib/native-platform";

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

function isOpenConversation(conversationId: string): boolean {
  return Boolean(
    conversationId &&
    document.visibilityState === "visible" &&
    document.hasFocus() &&
    window.location.pathname === `/app/chats/${conversationId}`,
  );
}

/**
 * Opens the Server-Sent Events stream whenever the user is authenticated and
 * fans events out to subscribers. Browser-native auto-reconnect covers
 * network blips; the stream itself re-verifies the session cookie on every
 * (re)connection, so logging out kills the channel server-side too.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
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
  // Register service worker and Capacitor push on mount
  useEffect(() => {
    // The installed Android app uses FCM through Capacitor. Registering the
    // web PWA worker inside its WebView creates a second, competing push and
    // update mechanism, so keep it exclusive to browser installs.
    if (!isNativeApp() && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  // Rebind an existing, already-permitted subscription on every account change.
  // Never request permission automatically. The worker independently checks the
  // signed-in account before presenting queued push metadata.
  useEffect(() => {
    if (status !== "authenticated" || !user?.id || isNativeApp() || !("serviceWorker" in navigator)) return;
    let stopped = false;
    const visible = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.serviceWorker.getRegistration("/").then(registration => registration?.active?.postMessage({ type: "CIRCLO_APP_VISIBLE" })).catch(() => {});
    };
    visible(); document.addEventListener("visibilitychange", visible);
    void navigator.serviceWorker.ready.then(async registration => {
      visible();
      const subscription = await registration.pushManager?.getSubscription();
      if (stopped) return;
      if (!subscription || !("Notification" in window) || Notification.permission !== "granted") { localStorage.removeItem("maddy:web-push-subscribed"); return; }
      const response = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()), signal: AbortSignal.timeout(10000) });
      if (response.ok && !stopped) localStorage.setItem("maddy:web-push-subscribed", "1");
    }).catch(() => {});
    return () => { stopped = true; document.removeEventListener("visibilitychange", visible); };
  }, [status, user?.id]);

  // Install the tap handler before token registration (including cold starts).
  useEffect(() => {
    let stopped = false;
    let removeTap: (() => void) | undefined;
    void (async () => {
      try {
        const native = await import("@/lib/capacitor-push");
        if (!native.isCapacitor() || stopped) return;
        removeTap = await native.setupNotificationTapListener();
        if (stopped) { removeTap(); return; }
        if (status === "authenticated") {
          const token = await native.registerCapacitorPush();
          if (token && !stopped) await native.sendTokenToServer(token);
        }
      } catch { /* Plugins are absent in browser builds. */ }
    })();
    return () => { stopped = true; removeTap?.(); };
  }, [status, user?.id]);


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

  useEffect(() => {
    const ring = () => { if (notificationPreferences.current?.notificationSound) playNotificationSound(); };
    window.addEventListener("circlo:incoming-call", ring);
    return () => window.removeEventListener("circlo:incoming-call", ring);
  }, [playNotificationSound]);

  // Full deployments retain cooperative scheduling; starter queues stay paused.
  useEffect(() => {
    if (status !== "authenticated" || process.env.NEXT_PUBLIC_STARTER_MODE === "1") return;
    const processDue = () => {
      if (document.visibilityState === "visible") {
        void fetch("/api/scheduled/process", { method: "POST" }).catch(() => undefined);
      }
    };
    processDue();
    const timer = window.setInterval(processDue, 15_000);
    document.addEventListener("visibilitychange", processDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", processDue);
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
    let hadConnection = false;
    es.onopen = () => {
      setConnected(true);
      window.dispatchEvent(new Event("maddy:message-request-keys"));
      if (hadConnection) router.refresh();
      hadConnection = true;
    };
    es.addEventListener("resync", () => router.refresh());
    es.onerror = () => setConnected(false);
    const received = new Set<string>();
    es.onmessage = (e) => {
      if (e.lastEventId) {
        if (received.has(e.lastEventId)) return;
        received.add(e.lastEventId);
        if (received.size > 5000) received.delete(received.values().next().value!);
      }
      let event: RealtimeEvent;
      try {
        event = JSON.parse(e.data) as RealtimeEvent;
        if (event.type === "conversation:encryption-ready" || event.type === "conversation:accepted") {
          window.dispatchEvent(new Event("maddy:message-request-keys"));
        }
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
        const activeConversation = isOpenConversation(conversationId);

        // The user is already reading this exact chat. Do not add an alert,
        // play a sound, or leave a notification unread in that situation.
        if (activeConversation) {
          void fetch(`/api/notifications/${event.notification.id}/read`, { method: "PATCH" });
          return;
        }

        if (document.visibilityState === "visible") {
          // Keep the inbox badge current without foreground OS alerts or sound.
          listeners.current.forEach(fn => { try { fn(event); } catch {} });
          return;
        }
        if (preferences?.notificationSound && localStorage.getItem("maddy:web-push-subscribed") !== "1") playNotificationSound();
        if (
          preferences?.pushNotifications &&
          localStorage.getItem("maddy:web-push-subscribed") !== "1" &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          (document.visibilityState === "hidden" || !document.hasFocus())
        ) {
          const title = actor;
          const message = String(data?.messageId ?? "");
          const url = `/app/chats/${conversationId}?message=${encodeURIComponent(message)}`;
          const options: NotificationOptions = {
            body: preview,
            tag: `circlo-${user?.id}-${conversationId}`,
            icon: "/icons/circlo-192.png",
            badge: "/icons/circlo-badge-96.png",
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
              navigateWithReload(url);
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
  }, [playNotificationSound, router, status, user?.id]);

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
