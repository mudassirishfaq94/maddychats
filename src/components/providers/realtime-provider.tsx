"use client";

import { LOCKED_CHATS_KEY, notificationLockedChatIds, resolveLocalNotification } from "@/lib/local-notification-preview";
import { useSharedE2EE } from "./e2ee-provider";
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
  showNotificationDetails: boolean;
}

/**
 * Latest notification preferences. Every surface that renders an alert reads
 * this snapshot so the sender and preview follow the same rule everywhere.
 */
let notificationPreferencesSnapshot: NotificationPreferences | null = null;

export function useNotificationPreferences(): NotificationPreferences | null {
  return notificationPreferencesSnapshot;
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
  const { decrypt } = useSharedE2EE();
  const { status, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceState>({});
  const privacyVersion = useRef(0);
  const listeners = useRef(new Set<Listener>());
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !user?.id) return;
    let active = true;
    let privacyEpoch = 0;
    const resolve = (id: string) => resolveLocalNotification(id, user.id, decrypt, () => active);
    const workerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "CIRCLO_PREVIEW" || event.data.recipientId !== user.id || !event.ports[0]) return;
      const epoch = privacyEpoch;
      void resolve(event.data.notificationId).then(detail => {
        event.ports[0].postMessage(active && epoch === privacyEpoch ? detail : null);
        event.ports[0].close();
      }).catch(() => { event.ports[0].postMessage(null); event.ports[0].close(); });
    };
    const nativeMessage = (event: Event) => {
      const payload = (event as CustomEvent<{ recipientId: string; notificationId: string }>).detail;
      if (!payload || payload.recipientId !== user.id || document.visibilityState === "visible") return;
      const epoch = privacyEpoch;
      void resolve(payload.notificationId).then(async detail => {
        if (!detail || !active || epoch !== privacyEpoch || document.visibilityState === "visible") return;
        const bridge = await import("@/lib/native-push-bridge");
        if (!active || epoch !== privacyEpoch) return;
        await bridge.showLocalNotification({ ...detail, recipientId: user.id, notificationId: payload.notificationId });
      }).catch(() => {});
    };
    const privacyChanged = () => {
      privacyEpoch++;
      privacyVersion.current++;
      if ("serviceWorker" in navigator) void navigator.serviceWorker.ready.then(registration => registration.active?.postMessage({ type: "CIRCLO_PRIVACY_CHANGED", recipientId: user.id, lockedChats: notificationLockedChatIds() }));
      if (isNativeApp()) void import("@/lib/native-push-bridge").then(bridge => bridge.syncNotificationPrivacy(user.id, notificationLockedChatIds())).catch(() => {});
    };
    const storageChanged = (event: StorageEvent) => { if (event.key === null || event.key === LOCKED_CHATS_KEY) privacyChanged(); };
    privacyChanged();
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    window.addEventListener("circlo:native-notification", nativeMessage);
    window.addEventListener("maddy:locked-chats", privacyChanged);
    window.addEventListener("maddy:notification-preferences", privacyChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
      window.removeEventListener("circlo:native-notification", nativeMessage);
      window.removeEventListener("maddy:locked-chats", privacyChanged);
      window.removeEventListener("maddy:notification-preferences", privacyChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, [status, user?.id, decrypt]);

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

  // Hosted Android owns taps; rebind permitted tokens on account change/resume/refresh.
  // Permission prompts happen only through the explicit Settings button.
  useEffect(() => {
    if (!isNativeApp()) return;
    let stopped = false;
    let running = false;
    let preferenceEpoch = 0;
    let resyncRequested = false;
    let removeTap: (() => void) | undefined;
    const sync = async (): Promise<void> => {
      if (stopped || document.visibilityState !== "visible") return;
      if (running) { resyncRequested = true; return; }
      running = true;
      const epoch = preferenceEpoch;
      try {
        const bridge = await import("@/lib/native-push-bridge");
        const native = await import("@/lib/capacitor-push");
        if (stopped) return;
        if (status !== "authenticated" || !user?.id) {
          if (status !== "loading" && bridge.hasHostedPushBridge()) await bridge.hostedPush("clear");
          return;
        }
        // Preserve the same account during a failed retry, but detach a previous
        // account before network work. Older APKs retain their legacy clear path.
        if (bridge.hasHostedPushBridge()) await bridge.hostedPush("reconcile", user.id).catch(() => bridge.hostedPush("clear"));
        const preferenceResponse = await fetch("/api/notifications/preferences", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!preferenceResponse.ok || stopped) return;
        const settings = await preferenceResponse.json() as { preferences?: NotificationPreferences };
        if (settings.preferences?.pushNotifications !== true) {
          if (settings.preferences?.pushNotifications === false && bridge.hasHostedPushBridge()) await bridge.hostedPush("clear");
          return;
        }
        if (bridge.hasHostedPushBridge()) await bridge.hostedPush("bind", user.id);
        const token = await native.registerCapacitorPush(false);
        if (token && !stopped && epoch === preferenceEpoch) {
          await native.sendTokenToServer(token);
          if (!stopped && epoch === preferenceEpoch && bridge.hasHostedPushBridge()) {
            await bridge.hostedPush("bind", user.id);
            await bridge.syncNotificationPrivacy(user.id, notificationLockedChatIds());
          }
        }
      } catch { /* No false success; Settings provides an explicit retry and error. */ }
      finally {
        running = false;
        if (resyncRequested && !stopped) { resyncRequested = false; void sync(); }
      }
    };
    void import("@/lib/capacitor-push").then(async native => {
      removeTap = await native.setupNotificationTapListener();
      if (stopped) removeTap();
    }).catch(() => {});
    const preferenceChanged = (event: Event) => {
      const enabled = (event as CustomEvent<NotificationPreferences>).detail?.pushNotifications;
      preferenceEpoch++;
      if (enabled === false) void import("@/lib/native-push-bridge").then(bridge => bridge.hasHostedPushBridge() ? bridge.hostedPush("clear") : null).catch(() => {});
      else void sync();
    };
    void sync();
    window.addEventListener("maddy:notification-preferences", preferenceChanged);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("circlo:native-push-refresh", sync);
    return () => { stopped = true; removeTap?.(); window.removeEventListener("maddy:notification-preferences", preferenceChanged); document.removeEventListener("visibilitychange", sync); window.removeEventListener("circlo:native-push-refresh", sync); };
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
    if (status !== "authenticated") {
      // A signed-out device must not keep the previous account's alert rules.
      notificationPreferencesSnapshot = null;
      return;
    }
    const controller = new AbortController();
    void fetch("/api/notifications/preferences", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { preferences?: NotificationPreferences } | null) => {
        if (data?.preferences) notificationPreferencesSnapshot = data.preferences;
      })
      .catch(() => undefined);
    const update = (event: Event) => {
      notificationPreferencesSnapshot = (event as CustomEvent<NotificationPreferences>).detail;
    };
    window.addEventListener("maddy:notification-preferences", update);
    return () => {
      controller.abort();
      window.removeEventListener("maddy:notification-preferences", update);
    };
  }, [status]);

  useEffect(() => {
    const ring = () => { if (notificationPreferencesSnapshot?.notificationSound) playNotificationSound(); };
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

    let disposed = false;
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
        const preferences = notificationPreferencesSnapshot;
        const data = event.notification.data;
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
        const version = privacyVersion.current;
        if (isNativeApp() && preferences?.pushNotifications && user?.id) {
          void resolveLocalNotification(event.notification.id, user.id, decrypt, () => !disposed && version === privacyVersion.current).then(async detail => {
            if (!detail || disposed || version !== privacyVersion.current || document.visibilityState === "visible") return;
            const bridge = await import("@/lib/native-push-bridge");
            if (disposed || version !== privacyVersion.current) return;
            await bridge.showLocalNotification({ ...detail, recipientId: user.id, notificationId: event.notification.id });
          }).catch(() => {});
        }
        if (preferences?.notificationSound && localStorage.getItem("maddy:web-push-subscribed") !== "1") playNotificationSound();
        if (
          !isNativeApp() && preferences?.pushNotifications &&
          localStorage.getItem("maddy:web-push-subscribed") !== "1" &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          (document.visibilityState === "hidden" || !document.hasFocus())
        ) {
          void resolveLocalNotification(event.notification.id, user!.id, decrypt, () => !disposed && version === privacyVersion.current).then(detail => {
            if (!detail || disposed || version !== privacyVersion.current || document.visibilityState === "visible") return;
            const url = `/app/chats/${detail.conversationId}?message=${detail.messageId}`;
            const options: NotificationOptions = {
              body: detail.body, tag: `circlo-${user?.id}-${conversationId}`,
              icon: "/icons/circlo-192.png", badge: "/icons/circlo-badge-96.png", data: { url }, silent: detail.silent,
            };
            if ("serviceWorker" in navigator) {
              void navigator.serviceWorker.ready.then(registration => { if (!disposed && version === privacyVersion.current) return registration.showNotification(detail.title, options); });
            } else {
              const notification = new Notification(detail.title, options);
              notification.onclick = () => { window.focus(); navigateWithReload(url); notification.close(); };
            }
          }).catch(() => {});
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
      disposed = true;
      es.close();
      setConnected(false);
      setPresence({});
    };
  }, [playNotificationSound, router, status, user, decrypt]);

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
