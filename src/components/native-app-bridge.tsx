"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native-platform";

/**
 * Makes the installed build behave like an Android application instead of a
 * browser tab. This is deliberately not mounted on the public web site.
 */
export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let disposed = false;
    const removeListeners: Array<() => Promise<void>> = [];

    void (async () => {
      try {
        const [{ App }, { StatusBar, Style }, { Keyboard, KeyboardResize }] = await Promise.all([
          import("@capacitor/app"),
          import("@capacitor/status-bar"),
          import("@capacitor/keyboard"),
        ]);
        if (disposed) return;

        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#0b1211" });
        await StatusBar.setOverlaysWebView({ overlay: false });
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });

        const appUrlListener = await App.addListener("appUrlOpen", ({ url }) => {
          // Deep links must stay in the app's WebView. Only accept ZipTalk's
          // own scheme/host, never route an arbitrary external URL in-app.
          try {
            const target = new URL(url);
            const isZipTalkLink = target.protocol === "ziptalks:" ||
              (target.protocol === "https:" && target.host === "ziptalks.vercel.app");
            if (isZipTalkLink) {
              // Custom-scheme URLs encode the first route segment as the
              // hostname (for example ziptalks://app/chats/123).
              const pathname = target.protocol === "ziptalks:"
                ? `/${target.host}${target.pathname}`
                : target.pathname;
              window.location.assign(`${pathname}${target.search}${target.hash}`);
            }
          } catch {
            // Ignore malformed deep links.
          }
        });
        removeListeners.push(() => appUrlListener.remove());

        const backListener = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) {
            window.history.back();
          } else {
            void App.minimizeApp();
          }
        });
        removeListeners.push(() => backListener.remove());
      } catch {
        // A missing native plugin must never prevent the web version loading.
      }
    })();

    return () => {
      disposed = true;
      void Promise.all(removeListeners.map((remove) => remove()));
    };
  }, []);

  return null;
}
