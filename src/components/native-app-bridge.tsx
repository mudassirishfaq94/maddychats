"use client";

import { navigateWithReload } from "@/lib/navigation";
import { openStartupDestination } from "@/lib/native-startup-navigation";
import { useAuth } from "@/components/providers/auth-provider";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isNativeApp, hasCapacitorRuntime } from "@/lib/native-platform";

declare global { interface Window { __circloNavigate?: (destination: string) => boolean; __circloOpenFromSnapshot?: (destination: string) => boolean } }

/**
 * Installs `window.__circloNavigate` for same-origin `/app` and `/app/` routes
 * in native runtimes. Only Capacitor runtimes configure system bars, keyboard
 * resizing, deep links and back handling; plugin setup failures are ignored.
 * Renders no UI.
 */
export function NativeAppBridge() {
  const router = useRouter();
  const { user, status } = useAuth();
  useEffect(() => {
    if (!isNativeApp() || status === "loading") return;
    const authenticatedUserId = user?.id;
    let disposed = false;
    void import("@/lib/native-push-bridge").then(bridge => {
      if (!disposed) return bridge.syncHostedStartup(status === "authenticated" && authenticatedUserId ? authenticatedUserId : null);
    }).catch(() => undefined); // Older APKs do not implement these optional commands.
    return () => { disposed = true; };
    // A successful refresh can rotate cookies without changing the account ID.
    // Renew its local binding too; otherwise idle startup falls back to network.
  }, [status, user]);
  useEffect(() => {
    if (!isNativeApp()) return;

    const navigate = (destination: string) => {
      try {
        const target = new URL(destination, window.location.origin);
        if (target.origin !== window.location.origin || !(target.pathname === "/app" || target.pathname.startsWith("/app/"))) return false;
        router.push(`${target.pathname}${target.search}${target.hash}`);
        return true;
      } catch { return false; }
    };
    window.__circloNavigate = navigate;
    const openSnapshot = (destination: string) => { try { return openStartupDestination(destination, navigate); } catch { return false; } };
    window.__circloOpenFromSnapshot = openSnapshot;
    let disposed = false;
    const removeListeners: Array<() => Promise<void>> = [];

    void (async () => {
      // MainActivity already handles bars, keyboard, back and deep links in
      // the hosted shell. Do not download plugins which cannot run there.
      if (!hasCapacitorRuntime()) return;
      try {
        const [{ App }, { StatusBar, Style }, { Keyboard, KeyboardResize }] = await Promise.all([
          import("@capacitor/app"),
          import("@capacitor/status-bar"),
          import("@capacitor/keyboard"),
        ]);
        if (disposed) return;

        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#151719" });
        await StatusBar.setOverlaysWebView({ overlay: false });
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });

        const appUrlListener = await App.addListener("appUrlOpen", ({ url }) => {
          // Deep links must stay in the app's WebView. Only accept Circlo's
          // own scheme/host, never route an arbitrary external URL in-app.
          try {
            const target = new URL(url);
            const isCircloLink = target.protocol === "ziptalks:" ||
              (target.protocol === "https:" && target.origin === window.location.origin);
            if (isCircloLink) {
              // Custom-scheme URLs encode the first route segment as the
              // hostname (for example ziptalks://app/chats/123).
              const pathname = target.protocol === "ziptalks:"
                ? `/${target.host}${target.pathname}`
                : target.pathname;
              navigateWithReload(`${pathname}${target.search}${target.hash}`);
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
      if (window.__circloNavigate === navigate) delete window.__circloNavigate;
      if (window.__circloOpenFromSnapshot === openSnapshot) delete window.__circloOpenFromSnapshot;
      void Promise.all(removeListeners.map((remove) => remove()));
    };
  }, [router]);

  return null;
}
