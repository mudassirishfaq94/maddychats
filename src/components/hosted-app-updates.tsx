"use client";
import { useEffect } from "react";
import { getCurrentAudioId } from "@/hooks/use-audio-player";
import { isNativeApp } from "@/lib/native-platform";

/** The installed Android shell uses the hosted app; update only when idle. */
export function HostedAppUpdates() {
  useEffect(() => {
    // Native releases are updated through the app store; do not make the
    // installed app behave like a browser tab that reloads itself.
    if (isNativeApp()) return;
    const current = process.env.NEXT_PUBLIC_APP_VERSION;
    if (!current || current === "development") return;
    let pending: string | null = null;
    let busy = false;
    let stopped = false;
    let lastInteraction = Date.now();
    const controller = new AbortController();
    const activity = () => { lastInteraction = Date.now(); };
    const check = async () => {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const response = await fetch("/api/app-version", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const { version } = await response.json();
        if (typeof version === "string" && version !== current && version !== "development") pending = version;
        if (!pending || Date.now() - lastInteraction < 30000) return;
        const hasDraft = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")]
          .some(input => input.value.trim());
        if (hasDraft || document.querySelector('[role="dialog"], [aria-label="Stop recording"], [aria-label="Send voice message"], [aria-label="Send message"]:disabled') || getCurrentAudioId()) return;
        // Guard against a stale proxy response repeatedly reloading this tab.
        if (sessionStorage.getItem("ziptalk:last-auto-update") === pending) return;
        sessionStorage.setItem("ziptalk:last-auto-update", pending);
        window.location.reload();
      } catch { /* Offline or transient errors are retried at the next check. */ }
      finally { busy = false; }
    };
    const timer = window.setInterval(() => void check(), 60000);
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    return () => {
      stopped = true; controller.abort(); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, []);
  return null;
}
