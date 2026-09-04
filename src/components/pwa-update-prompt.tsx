"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * PWA Update Prompt — detects when a new service worker is waiting
 * and shows a non-intrusive prompt to reload the app.
 */
export function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    function onControllerChange() {
      // A new SW took control — prompt reload
      if (document.visibilityState === "visible") {
        setWaiting(true);
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Also check for a waiting worker on mount
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        setWaiting(true);
      }
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(true);
          }
        });
      });
    }).catch(() => {
      // SW not supported or failed
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting || dismissed) return null;

  function handleUpdate() {
    // Tell the waiting SW to skip waiting and take control
    navigator.serviceWorker.ready.then((reg) => {
      reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
    // Reload after a brief delay so the new SW can take over
    setTimeout(() => window.location.reload(), 300);
  }

  return (
    <div className="fixed bottom-24 left-1/2 z-[150] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-2xl animate-fade-up sm:bottom-6">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]">
        <RefreshCw className="h-4 w-4 text-[var(--accent-fg)]" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Update available</p>
        <p className="text-[0.7rem] text-[var(--muted)]">Reload to get the latest version</p>
      </div>
      <button
        type="button"
        onClick={handleUpdate}
        className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
