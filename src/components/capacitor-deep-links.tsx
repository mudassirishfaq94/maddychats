"use client";

import { useEffect } from "react";

function toAppPath(url: string): string | null {
  try {
    const target = new URL(url);
    if (target.protocol !== "ziptalks:" || target.hostname !== "chat") return null;
    const conversationId = target.pathname.split("/").filter(Boolean)[0];
    if (!conversationId) return "/app/chats";
    return `/app/chats/${conversationId}${target.search}`;
  } catch {
    return null;
  }
}

/** Keeps native notification and app links inside the Capacitor WebView. */
export function CapacitorDeepLinks() {
  useEffect(() => {
    let remove: (() => Promise<void>) | undefined;
    void import("@capacitor/app")
      .then(async ({ App }) => {
        const listener = await App.addListener("appUrlOpen", ({ url }) => {
          const path = toAppPath(url);
          if (path) window.location.assign(path);
        });
        remove = () => listener.remove();
      })
      .catch(() => undefined);
    return () => { void remove?.(); };
  }, []);
  return null;
}
