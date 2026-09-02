"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Loader2, Smartphone, Volume2, Users } from "lucide-react";

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

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState<keyof Preferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

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

  async function toggle(key: keyof Preferences) {
    if (!preferences || saving) return;
    const next = !preferences[key];
    if (key === "pushNotifications" && next && "Notification" in window) {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission !== "granted") {
        setMessage("Desktop notifications were not allowed by the browser.");
        return;
      }
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
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setBrowserPermission(permission);
    setMessage(
      permission === "granted"
        ? "Desktop notifications enabled."
        : permission === "denied"
          ? "Notifications are blocked. Allow them in your browser's site settings."
          : "Notification permission was not granted.",
    );
  }

  return (
    <section className="card-glass rounded-3xl p-6 sm:p-8">
      <div>
        <h2 className="font-display text-xl font-bold">Notifications</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Choose how Maddy Chats alerts you.</p>
      </div>
      {!preferences ? (
        <div className="flex justify-center py-10">{message ? <p className="text-sm text-[var(--danger)]">{message}</p> : <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />}</div>
      ) : (
        <>
        {preferences.pushNotifications && browserPermission !== "granted" && browserPermission !== "unsupported" ? (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4">
            <BellRing className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Enable desktop alerts</p>
              <p className="text-xs text-[var(--muted)]">Allow this browser to show messages while the tab is in the background.</p>
            </div>
            <button type="button" onClick={() => void enableBrowserNotifications()} className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white">
              {browserPermission === "denied" ? "How to allow" : "Enable"}
            </button>
          </div>
        ) : null}
        <div className="mt-5 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--card-2)] px-4">
          {rows.map(({ key, label, hint, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3 py-4">
              <Icon className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" />
              <span className="min-w-0 flex-1"><b className="block text-sm">{label}</b><small className="text-[var(--muted)]">{hint}</small></span>
              <button type="button" role="switch" aria-checked={preferences[key]} aria-label={label} disabled={saving !== null} onClick={() => void toggle(key)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${preferences[key] ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}>
                <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${preferences[key] ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          ))}
        </div>
        </>
      )}
      {preferences && message ? <p role="status" className={`mt-3 text-xs ${message.includes("saved") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{message}</p> : null}
    </section>
  );
}
