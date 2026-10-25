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
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-provider";
import type { PresenceState, RealtimeEvent } from "@/lib/types";
import { createConditionalInterval } from "@/lib/conditional-interval";
import { createPresenceStore } from "@/lib/presence-store";
import { isNativeApp } from "@/lib/native-platform";
import { readNotificationPreferences, invalidateNotificationPreferences } from "@/lib/notification-preference-read";

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
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);
const PresenceContext = createContext<ReturnType<typeof createPresenceStore> | null>(null);

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
  const { status, user, requestScope } = useAuth();
  const userId = user?.id;
  const [connected, setConnected] = useState(false);
  const [presenceStore] = useState(createPresenceStore);
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
      const payload = (event as CustomEvent<{ recipientId: string; notificationId: string; backgroundPreview?: boolean }>).detail;
      if (!payload || payload.recipientId !== user.id || (!payload.backgroundPreview && document.visibilityState === "visible")) return;
      const epoch = privacyEpoch;
      void resolve(payload.notificationId).then(async detail => {
        if (!detail || !active || epoch !== privacyEpoch || (!payload.backgroundPreview && document.visibilityState === "visible")) return;
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
    // The push rebind does an FCM token fetch + server registration. Throttle
    // visibilitychange so returning from another app or switching tabs does
    // not rebind the token on every focus.
    let lastPushSyncAt = 0;
    const sync = async (force = false): Promise<void> => {
      if (stopped || document.visibilityState !== "visible") return;
      if (running) { if (force) resyncRequested = true; return; }
      if (!force && Date.now() - lastPushSyncAt < 30_000) return;
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
        const settings = await readNotificationPreferences(requestScope);
        if (!settings || stopped) return;
        if (settings.pushNotifications !== true) {
          if (settings.pushNotifications === false && bridge.hasHostedPushBridge()) await bridge.hostedPush("clear");
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
        lastPushSyncAt = Date.now();
        running = false;
        if (resyncRequested && !stopped) { resyncRequested = false; void sync(true); }
      }
    };
    void import("@/lib/capacitor-push").then(async native => {
      removeTap = await native.setupNotificationTapListener();
      if (stopped) removeTap();
    }).catch(() => {});
    const preferenceChanged = (event: Event) => {
      const enabled = (event as CustomEvent<NotificationPreferences>).detail?.pushNotifications;
      preferenceEpoch++;
      invalidateNotificationPreferences(requestScope);
      if (enabled === false) void import("@/lib/native-push-bridge").then(bridge => bridge.hasHostedPushBridge() ? bridge.hostedPush("clear") : null).catch(() => {});
      else void sync(true);
    };
    const resume = () => { void sync(); };
    const explicitRefresh = () => { void sync(true); };
    void sync();
    window.addEventListener("maddy:notification-preferences", preferenceChanged);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("circlo:native-push-refresh", explicitRefresh);
    return () => { stopped = true; removeTap?.(); window.removeEventListener("maddy:notification-preferences", preferenceChanged); document.removeEventListener("visibilitychange", resume); window.removeEventListener("circlo:native-push-refresh", explicitRefresh); };
  }, [status, user?.id, requestScope]);


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
    if (status !== "authenticated" || !userId) {
      // A signed-out device must not keep the previous account's alert rules.
      notificationPreferencesSnapshot = null;
      return;
    }
    notificationPreferencesSnapshot = null;
    const controller = new AbortController();
    void readNotificationPreferences(requestScope)
      .then(preferences => {
        if (!controller.signal.aborted && preferences) notificationPreferencesSnapshot = preferences;
      })
      .catch(() => undefined);
    const update = (event: Event) => {
      invalidateNotificationPreferences(requestScope);
      controller.abort(); // A pre-save read must not replace freshly saved preferences.
      notificationPreferencesSnapshot = (event as CustomEvent<NotificationPreferences>).detail;
    };
    window.addEventListener("maddy:notification-preferences", update);
    return () => {
      controller.abort();
      window.removeEventListener("maddy:notification-preferences", update);
    };
  }, [status, userId, requestScope]);

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
    const timer = createConditionalInterval(() => document.visibilityState === "visible", processDue, 15_000);
    const visibility = () => { timer.refresh(); processDue(); };
    timer.refresh(); document.addEventListener("visibilitychange", visibility);
    return () => {
      timer.stop();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [status]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;

    let disposed = false;
    const es = new EventSource("/api/realtime/stream");
    const acknowledgments = new Set<string>();
    let ackTimer: ReturnType<typeof setTimeout> | undefined;
    let syncingDelivery = false;
    let acknowledging = false;
    const flushAcks = async () => {
      if (disposed || acknowledging || !acknowledgments.size) return;
      acknowledging = true;
      const messageIds = [...acknowledgments].slice(0, 100);
      messageIds.forEach(id => acknowledgments.delete(id));
      try {
        const response = await fetch("/api/messages/delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds }) });
        if (!response.ok) throw new Error("Acknowledgment unavailable");
      } catch { messageIds.forEach(id => acknowledgments.add(id)); }
      acknowledging = false;
      if (!disposed && acknowledgments.size) ackTimer = setTimeout(() => void flushAcks(), 2500);
    };
    const acknowledge = (id: string) => { acknowledgments.add(id); clearTimeout(ackTimer); if (acknowledgments.size >= 50) void flushAcks(); else ackTimer = setTimeout(() => void flushAcks(), 300); };
    const syncDelivery = async () => {
      if (disposed || syncingDelivery) return;
      syncingDelivery = true;
      try {
        for (let page = 0; page < 20 && !disposed; page++) {
          const response = await fetch("/api/messages/delivery", { cache: "no-store" });
          if (!response.ok) break;
          const { envelopes } = await response.json();
          if (!Array.isArray(envelopes) || !envelopes.length) break;
          for (const envelope of envelopes) if (typeof envelope.id === "string") acknowledgments.add(envelope.id);
          await flushAcks();
          if (acknowledgments.size || envelopes.length < 100) break;
        }
      } catch { /* Reconnect/periodic sync retries actual unacknowledged envelopes. */ }
      finally { syncingDelivery = false; }
    };
    const deliveryTimer = setInterval(() => { if (es.readyState === EventSource.OPEN) void syncDelivery(); }, 60000);
    let hadConnection = false;
    es.onopen = () => {
      setConnected(true);
      void syncDelivery();
      window.dispatchEvent(new Event("maddy:message-request-keys"));
      hadConnection = true;
    };
    es.addEventListener("resync", () => { /* resync events are handled by connected components via the SSE stream */ });
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
      if (event.type === "message:new" && event.message.senderId !== userId) acknowledge(event.message.id);
      // Presence is centrally tracked so any component can read it.
      if (event.type === "presence:update") {
        presenceStore.update(event.userId, { online: event.online, lastSeenAt: event.lastSeenAt });
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
        if (isNativeApp() && preferences?.pushNotifications && userId) {
          void resolveLocalNotification(event.notification.id, userId, decrypt, () => !disposed && version === privacyVersion.current).then(async detail => {
            if (!detail || disposed || version !== privacyVersion.current || document.visibilityState === "visible") return;
            const bridge = await import("@/lib/native-push-bridge");
            if (disposed || version !== privacyVersion.current) return;
            await bridge.showLocalNotification({ ...detail, recipientId: userId, notificationId: event.notification.id });
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
          void resolveLocalNotification(event.notification.id, userId, decrypt, () => !disposed && version === privacyVersion.current).then(detail => {
            if (!detail || disposed || version !== privacyVersion.current || document.visibilityState === "visible") return;
            const url = `/app/chats/${detail.conversationId}?message=${detail.messageId}`;
            const options: NotificationOptions = {
              body: detail.body, tag: `circlo-${userId}-${conversationId}`,
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
      clearInterval(deliveryTimer); clearTimeout(ackTimer); es.close();
      setConnected(false);
      presenceStore.clear();
    };
  }, [playNotificationSound, router, status, userId, decrypt, presenceStore]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ connected, subscribe }),
    [connected, subscribe],
  );

  return (
    <RealtimeContext.Provider value={value}>
      <PresenceContext.Provider value={presenceStore}>{children}</PresenceContext.Provider>
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

export function usePresenceMap(): PresenceState {
  const store = useContext(PresenceContext);
  if (!store) throw new Error("PresenceProvider is missing");
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
export function usePresence(userId?: string) {
  const store = useContext(PresenceContext);
  if (!store) throw new Error("PresenceProvider is missing");
  return useSyncExternalStore(store.subscribe, () => userId ? store.getSnapshot()[userId] : undefined, () => undefined);
}
