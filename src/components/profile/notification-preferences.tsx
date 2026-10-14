"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Loader2, Smartphone, Volume2, Users } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { isNativeApp } from "@/lib/native-platform";

interface Preferences {
  messageNotifications: boolean;
  groupNotifications: boolean;
  pushNotifications: boolean;
  notificationSound: boolean;
}

const rows = [
  { key: "messageNotifications", label: "Message notifications", hint: "Alerts for new direct messages", icon: Bell },
  { key: "groupNotifications", label: "Group notifications", hint: "Alerts for activity in group chats", icon: Users },
  { key: "pushNotifications", label: "Desktop and mobile push", hint: "Allow push alerts on supported devices", icon: Smartphone },
  { key: "notificationSound", label: "Notification sound", hint: "Play a sound when an alert arrives", icon: Volume2 },
] as const;

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function subscriptionMatchesKey(subscription: PushSubscription, expected: Uint8Array) {
  const previous = subscription.options?.applicationServerKey;
  if (!previous) return false;
  const bytes = new Uint8Array(previous);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<keyof Preferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications/preferences", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load notification settings.");
        return response.json() as Promise<{ preferences: Preferences }>;
      })
      .then((data) => setPreferences(data.preferences))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setMessage(error.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (isNativeApp() || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    void navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async subscription => {
        if (!subscription) return;
        const response = await fetch("/api/notifications/push", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) return;
        const configuration = await response.json() as { publicKey: string | null };
        if (configuration.publicKey && subscriptionMatchesKey(subscription, applicationServerKey(configuration.publicKey))) {
          const rebound = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()), signal: AbortSignal.timeout(10000) });
          if (rebound.ok) setPushSubscribed(true);
        }
      })
      .catch(() => {});
  }, []);

  async function subscribeForPush(): Promise<boolean> {
    // The Capacitor FCM registration runs after sign-in. There is no browser
    // service-worker subscription in the installed app.
    if (isNativeApp()) return true;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage("Push notifications are not supported on this device or browser.");
      return false;
    }
    setSubscribing(true);
    try {
      // Ask permission within the click gesture (required by mobile Safari).
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission !== "granted") {
        setMessage("Notifications are blocked. Allow them in this app's site settings.");
        return false;
      }
      const configurationResponse = await fetch("/api/notifications/push", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!configurationResponse.ok) throw new Error("Could not load push settings. Sign in again and retry.");
      const { publicKey } = await configurationResponse.json() as { publicKey: string | null };
      if (!publicKey) throw new Error("Push alerts are temporarily unavailable. Please try again later.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Notifications could not start. Reload this page and retry.")), 10000); })]).finally(() => { if (deadline) clearTimeout(deadline); });
      const serverKey = applicationServerKey(publicKey);
      let existing = await registration.pushManager.getSubscription();
      if (existing && !subscriptionMatchesKey(existing, serverKey)) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        existing = null;
        await fetch("/api/notifications/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }), signal: AbortSignal.timeout(10000) }).catch(() => null);
      }
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey,
      });
      const response = await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("The device could not be registered.");
      setPushSubscribed(true);
      try { localStorage.setItem("maddy:web-push-subscribed", "1"); } catch { /* Subscription does not depend on optional browser storage. */ }
      setMessage("Push alerts enabled on this device.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Push notifications could not be enabled.");
      return false;
    } finally {
      setSubscribing(false);
    }
  }

  async function toggle(key: keyof Preferences) {
    if (!preferences || saving || subscribing) return;
    const next = !preferences[key];
    if (key === "pushNotifications" && next && !(await subscribeForPush())) {
      return;
    }
    setSaving(key);
    setMessage(null);
    const response = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("That setting could not be saved. Please try again.");
    } else {
      const data = await response.json() as { preferences: Preferences };
      setPreferences(data.preferences);
      window.dispatchEvent(new CustomEvent("maddy:notification-preferences", { detail: data.preferences }));
      setMessage("Notification settings saved.");
    }
    setSaving(null);
  }

  async function enableBrowserNotifications() {
    await subscribeForPush();
  }

  return (
    <section className="card-glass rounded-3xl p-6 sm:p-8">
      <div>
        <h2 className="font-display text-xl font-bold">Notifications</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Quiet while you use Circlo. Branded chat alerts when it is in the background or closed.</p>
        <p className="mt-2 text-xs text-[var(--muted)]">Install Circlo from your browser menu, then enable alerts here. On iPhone, use Add to Home Screen first. Your phone controls notification sounds, appearance and battery restrictions.</p>
        <details className="mt-3 rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--muted)]">
          <summary className="cursor-pointer font-semibold text-[var(--text)]">Notifications arrive, but no pop-up?</summary>
          <p className="mt-2 leading-relaxed">On Android, press and hold a Circlo notification, open its settings, then enable Alerting and Pop on screen (or Floating notifications). Check that Do Not Disturb is off and Notification sound is enabled below. Menu names vary by phone. Android controls banners; a website cannot override these settings.</p>
        </details>
      </div>
      {!preferences ? (
        <div className="flex justify-center py-10">{message ? <p className="text-sm text-[var(--danger)]">{message}</p> : <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />}</div>
      ) : (
        <>
        {preferences.pushNotifications && !isNativeApp() && !pushSubscribed && browserPermission !== "unsupported" ? (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
            <BellRing className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Enable push alerts on this device</p>
              <p className="text-xs text-[var(--muted)]">Receive messages in Android&apos;s notification panel, even when Circlo is closed.</p>
            </div>
            <button type="button" disabled={subscribing} onClick={() => void enableBrowserNotifications()} className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
              {subscribing ? "Enabling…" : browserPermission === "denied" ? "Try again" : "Enable"}
            </button>
          </div>
        ) : null}
        <div className="mt-5 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-4">
          {rows.map(({ key, label, hint, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3 py-4">
              <Icon className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" />
              <span className="min-w-0 flex-1"><b className="block text-sm">{label}</b><small className="text-[var(--muted)]">{hint}</small></span>
              <Toggle checked={preferences[key]} onChange={() => void toggle(key)} disabled={saving !== null || subscribing} label={label} />
            </div>
          ))}
        </div>
        </>
      )}
      {preferences && message ? <p role="status" className={`mt-3 text-xs ${message.includes("saved") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{message}</p> : null}
    </section>
  );
}
