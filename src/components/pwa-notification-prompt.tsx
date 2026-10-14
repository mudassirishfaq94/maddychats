"use client";
import Link from "next/link";
import { useSyncExternalStore, useState } from "react";
import { usePathname } from "next/navigation";
const subscribe = () => () => {};
const installed = () => (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true) && "Notification" in window && Notification.permission === "default";
export function PwaNotificationPrompt() {
  const eligible = useSyncExternalStore(subscribe, installed, () => false);
  const [dismissed, setDismissed] = useState(false);
  const path = usePathname();
  if (!eligible || dismissed || path === "/app/profile") return null;
  return <aside aria-label="Set up Circlo notifications" className="fixed inset-x-3 bottom-20 z-[100] mx-auto max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl sm:bottom-5">
    <p className="text-sm font-semibold">Keep your circle close</p>
    <p className="mt-1 text-xs text-[var(--muted)]">Enable private message alerts for when Circlo is in the background or closed.</p>
    <div className="mt-3 flex gap-3"><Link href="/app/profile#notifications" className="btn btn-primary min-h-11 text-xs">Set up notifications</Link><button type="button" onClick={() => setDismissed(true)} className="btn min-h-11 text-xs">Not now</button></div>
  </aside>;
}
