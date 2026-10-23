"use client";
import Link from "next/link";
import { useSyncExternalStore, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./providers/auth-provider";
import { isNativeApp } from "@/lib/native-platform";
import { androidNotificationStatus, hostedPush, syncNotificationPrivacy } from "@/lib/native-push-bridge";
import { notificationLockedChatIds } from "@/lib/local-notification-preview";
import { readNotificationPreferences } from "@/lib/notification-preference-read";
const subscribe = () => () => {};
const installed = () => (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true) && "Notification" in window && Notification.permission === "default";
export function PwaNotificationPrompt() {
  const eligible = useSyncExternalStore(subscribe, installed, () => false);
  const native = useSyncExternalStore(subscribe, isNativeApp, () => false);
  const { user, requestScope } = useAuth();
  const [nativeEligible, setNativeEligible] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const path = usePathname();
  useEffect(() => {
    if (!native || !user?.id) return;
    let stopped = false;
    try { if (localStorage.getItem(`maddy:notification-onboarding:${user.id}`)) return; } catch {}
    void Promise.all([androidNotificationStatus(), readNotificationPreferences(requestScope)])
      .then(([device, settings]) => { if (!stopped) setNativeEligible(Boolean(device && !device.enabled && settings?.pushNotifications)); }).catch(() => {});
    return () => { stopped = true; };
  }, [native, user?.id, requestScope]);
  const dismiss = () => {
    setDismissed(true);
    if (native && user?.id) try { localStorage.setItem(`maddy:notification-onboarding:${user.id}`, "1"); } catch {}
  };
  async function allow() {
    if (!user || working) return;
    setWorking(true); setError("");
    try {
      const push = await import("@/lib/capacitor-push");
      const token = await push.registerCapacitorPush(true);
      if (!token) throw new Error("Notifications are blocked. You can allow them in Android settings.");
      await push.sendTokenToServer(token);
      await hostedPush("bind", user.id);
      await syncNotificationPrivacy(user.id, notificationLockedChatIds());
      window.dispatchEvent(new Event("circlo:native-push-refresh"));
      dismiss();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry notification setup."); }
    finally { setWorking(false); }
  }
  if (!(native ? nativeEligible : eligible) || dismissed || path === "/app/profile" || path === "/app/call") return null;
  return <aside aria-label="Set up Circlo notifications" className="fixed inset-x-3 bottom-20 z-[100] mx-auto max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl sm:bottom-5">
    <p className="text-sm font-semibold">Keep your circle close</p>
    <p className="mt-1 text-xs text-[var(--muted)]">Enable private message alerts for when Circlo is in the background or closed.</p>
    <div className="mt-3 flex gap-3">{native ? <button type="button" disabled={working} onClick={() => void allow()} className="btn btn-primary min-h-11 text-xs">{working ? "Enabling…" : "Allow notifications"}</button> : <Link href="/app/settings#notifications" className="btn btn-primary min-h-11 text-xs">Set up notifications</Link>}<button type="button" disabled={working} onClick={dismiss} className="btn min-h-11 text-xs">Not now</button></div>
    {error ? <p role="status" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
  </aside>;
}
