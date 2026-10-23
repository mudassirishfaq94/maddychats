"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Eye, Loader2, Smartphone, Volume2, Users } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { useAuth } from "@/components/providers/auth-provider";
import { readNotificationPreferences, invalidateNotificationPreferences } from "@/lib/notification-preference-read";
import { isNativeApp } from "@/lib/native-platform";
import { hasHostedPushBridge, hostedPush, androidNotificationStatus, androidCallSettings, type AndroidNotificationStatus } from "@/lib/native-push-bridge";

interface Preferences {
  messageNotifications: boolean;
  groupNotifications: boolean;
  pushNotifications: boolean;
  notificationSound: boolean;
  showNotificationDetails: boolean;
}

const rows = [
  { key: "messageNotifications", label: "Message notifications", hint: "Alerts for new direct messages", icon: Bell },
  { key: "groupNotifications", label: "Group notifications", hint: "Alerts for activity in group chats", icon: Users },
  { key: "pushNotifications", label: "Desktop and mobile push", hint: "Allow push alerts on supported devices", icon: Smartphone },
  { key: "notificationSound", label: "Notification sound", hint: "Play a sound when an alert arrives", icon: Volume2 },
  { key: "showNotificationDetails", label: "Show sender and message preview", hint: "On by default. Turn off to hide sender names and message text", icon: Eye },
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
  const { requestScope } = useAuth();
  const [androidStatus, setAndroidStatus] = useState<AndroidNotificationStatus | null>(null);
  const [hasAndroidSettings, setHasAndroidSettings] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      if (!isNativeApp()) return;
      void fetch("/api/push/register", { cache: "no-store", signal: AbortSignal.timeout(10000) })
        .then(async response => { if (response.ok) { const data = await response.json(); if (!stopped) setPushSubscribed(data.registered === true); } }).catch(() => {});
      if (hasHostedPushBridge()) {
        setHasAndroidSettings(true);
        void androidNotificationStatus().then(status => { if (!stopped) setAndroidStatus(status); }).catch(() => {});
      }
    };
    refresh();
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("circlo:native-push-refresh", refresh);
    return () => { stopped = true; document.removeEventListener("visibilitychange", visible); window.removeEventListener("circlo:native-push-refresh", refresh); };
  }, []);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<keyof Preferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    let stopped = false;
    void readNotificationPreferences(requestScope)
      .then((preferences) => {
        if (!preferences) throw new Error("Could not load notification settings.");
        if (!stopped) setPreferences(preferences);
      })
      .catch((error: Error) => {
        if (!stopped) setMessage(error.message);
      });
    return () => { stopped = true; };
  }, [requestScope]);

  useEffect(() => {
    if (isNativeApp() || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    void navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async subscription => {
        if (!subscription) { setPushSubscribed(false); return; }
        const response = await fetch("/api/notifications/push", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) return;
        const configuration = await response.json() as { publicKey: string | null };
        if (configuration.publicKey && subscriptionMatchesKey(subscription, applicationServerKey(configuration.publicKey))) {
          const rebound = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()), signal: AbortSignal.timeout(10000) });
          if (rebound.ok) setPushSubscribed(true);
        } else if (configuration.publicKey) setPushSubscribed(false);
      })
      .catch(() => {});
  }, []);

  async function subscribeForPush(): Promise<boolean> {
    // The Capacitor FCM registration runs after sign-in. There is no browser
    // service-worker subscription in the installed app.
    if (isNativeApp()) {
      setSubscribing(true);
      try {
        const native = await import("@/lib/capacitor-push");
        const token = await native.registerCapacitorPush(true);
        if (!token) throw new Error("Allow notifications in Android Settings, then try again.");
        await native.sendTokenToServer(token);
        setPushSubscribed(true);
        window.dispatchEvent(new Event("circlo:native-push-refresh"));
        setMessage("Push alerts enabled on this device.");
        return true;
      } catch (error) { setMessage(error instanceof Error ? error.message : "Notifications unavailable."); return false; }
      finally { setSubscribing(false); }
    }
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
      setMessage("Push alerts enabled. Floating banners and sounds also depend on your browser and Android settings.");
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
    setSaving(key);
    setMessage(null);
    // Save account intent independently from this device's permission/provider
    // status. Start permission work in the click gesture, even if the save waits.
    const enrollment = key === "pushNotifications" && next ? subscribeForPush() : null;
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
      invalidateNotificationPreferences(requestScope);
      window.dispatchEvent(new CustomEvent("maddy:notification-preferences", { detail: data.preferences }));
      if (!enrollment) setMessage("Notification settings saved.");
    }
    const enrolled = enrollment ? await enrollment : true;
    if (!response?.ok) setMessage("That setting could not be saved. Please try again.");
    else if (enrollment && enrolled) setMessage("Notification settings saved.");
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
          <p className="mt-2 leading-relaxed">Receiving an alert and showing a floating banner are separate settings. Circlo can request an alert; Android and your browser decide whether to show a banner.</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 leading-relaxed">
            <li>Press and hold an actual Circlo message in your notification panel, then tap Settings. This opens the correct app or channel, which may belong to Circlo or Chrome.</li>
            <li>Choose Alerting and enable Pop on screen, Pop-up notifications or Floating notifications if your phone offers it. The channel may be called General, Messages or a site name.</li>
            <li>Check Do Not Disturb, your phone&apos;s notification sound and Circlo&apos;s Notification sound setting below. Muted chats stay quiet.</li>
          </ol>
          <p className="mt-2 leading-relaxed">For the Chrome-installed app, also check Chrome → Settings → Site settings → Notifications → circlo.chat. The separately installed Android APK has different settings. Your saved Android preferences are preserved; Circlo cannot turn these switches on for you.</p>
          <p className="mt-2 leading-relaxed">When previews are enabled, unlocked chats can show the sender and message text while Circlo can securely read them on this device. Requests and locked chats hide message text. A closed or suspended app may show a generic alert.</p>
        </details>
      </div>
      {hasAndroidSettings ? (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
          <p className="text-sm font-semibold">Android message alerts</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{androidStatus && !androidStatus.enabled
            ? "Android has blocked Circlo notifications. Allow them in Android settings."
            : androidStatus?.messagesImportance != null && androidStatus.messagesImportance < 4
              ? "Android has set Messages to quiet or blocked. Open settings to choose Alerting and Pop on screen."
              : "Android controls pop-ups, Do Not Disturb and sounds. If banners are missing, check Messages and Pop on screen (sometimes called Floating notifications)."}</p>
          <button type="button" className="mt-3 max-w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold whitespace-normal" onClick={() => void hostedPush("settings").catch(() => setMessage("Open Android Settings > Apps > Circlo > Notifications > Messages. Older app versions may call this General."))}>Open Android notification settings</button>
          {androidStatus?.fullScreenAllowed !== undefined ? <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="text-sm font-semibold">Incoming calls</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{androidStatus.callsImportance === 0 ? "Incoming call notifications are blocked in Android settings." : androidStatus.fullScreenAllowed ? "Full-screen call alerts are allowed. Android still controls Do Not Disturb and lock-screen presentation." : "Answer and Decline appear in the incoming-call notification. You can allow full-screen alerts for locked-screen calls in Android settings."}</p>
            <button type="button" className="mt-2 min-h-11 text-sm underline" onClick={() => void androidCallSettings().catch(() => setMessage("Open Android Settings > Apps > Circlo > Notifications > Incoming calls, and Special app access > Full-screen notifications."))}>Open Android call settings</button>
            <p className="mt-1 text-xs text-[var(--muted)]">Circlo requests microphone access only when you answer or start a call. Android force-stop prevents incoming calls until you reopen the app.</p>
          </div> : null}
        </div>
      ) : null}
      {!preferences ? (
        <div className="flex justify-center py-10">{message ? <p className="text-sm text-[var(--danger)]">{message}</p> : <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />}</div>
      ) : (
        <>
        {preferences.pushNotifications && pushSubscribed === false && (isNativeApp() || browserPermission !== "unsupported") ? (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
            <BellRing className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Enable push alerts on this device</p>
              <p className="text-xs text-[var(--muted)]">Receive messages in Android&apos;s notification panel, even when Circlo is closed.</p>
            </div>
            <button type="button" disabled={subscribing} onClick={() => void enableBrowserNotifications()} className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
              {subscribing ? "Enabling…" : !isNativeApp() && browserPermission === "denied" ? "Try again" : "Enable"}
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
        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">Off by default for privacy. Previews are created on this device and may appear on your lock screen or remain in device notification history. Locked chats hide the sender and message text; message requests show a generic request alert.</p>
        </>
      )}
      {preferences && message ? <p role="status" className={`mt-3 text-xs ${message.includes("saved") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{message}</p> : null}
    </section>
  );
}
