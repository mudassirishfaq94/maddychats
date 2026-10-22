"use client";
import { Profiler, useEffect, useRef, useSyncExternalStore, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Metric } from "web-vitals";

type Sample = { kind: string; name: string; value: number; phase?: string };
declare global { interface Window { __circloPerformance?: Sample[]; __circloProfilingEnabled?: boolean; __circloVitalsRegistered?: boolean } }
const safeNames = new Set(["startup-hydrated", "chat-navigation", "first-readable-message", "navigation", "auth-refresh", "notification-preferences", "conversation-list", "conversation-detail", "message-history", "community-list", "api-other", "conversations", "history"]);
const enabled = () => {
  const value = new URLSearchParams(window.location.search).get("profile") === "1";
  window.__circloProfilingEnabled = value;
  return value;
};
const subscribe = (listener: () => void) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); };
function record(sample: Sample) {
  if (!window.__circloProfilingEnabled || !safeNames.has(sample.name) && !["react", "vital", "longtask"].includes(sample.kind) || !Number.isFinite(sample.value)) return;
  const samples = window.__circloPerformance ??= [];
  if (sample.kind === "vital") {
    const index = samples.findIndex((entry) => entry.kind === "vital" && entry.name === sample.name);
    if (index >= 0) { samples[index] = sample; return; }
  }
  if (samples.length < 500) samples.push(sample);
}
export function recordApplicationTiming(name: "first-readable-message", value: number) {
  record({ kind: "chat", name, value });
}
const render: ProfilerOnRenderCallback = (id, phase, actualDuration) => record({ kind: "react", name: id, phase, value: actualDuration });
const vital = (metric: Metric) => record({ kind: "vital", name: metric.name, value: metric.value });

function routeFamily(pathname: string) {
  if (pathname === "/app/chats" || /^\/app\/chats\/[^/]+$/.test(pathname)) return "chat-navigation";
  if (pathname.startsWith("/app/")) return "navigation";
  return null;
}
function resourceFamily(resourceName: string) {
  let path: string;
  try { path = new URL(resourceName, window.location.href).pathname; } catch { return null; }
  if (path === "/api/auth/me") return "auth-refresh";
  if (path === "/api/notifications/preferences") return "notification-preferences";
  if (path === "/api/conversations") return "conversation-list";
  if (/^\/api\/conversations\/[^/]+\/messages$/.test(path)) return "message-history";
  if (/^\/api\/conversations\/[^/]+$/.test(path)) return "conversation-detail";
  if (path === "/api/communities") return "community-list";
  return path.startsWith("/api/") ? "api-other" : null;
}

/** Opt-in, bounded, local-only measurements; no telemetry or message data sent. */
export function PerformanceMonitor({ children }: { children: ReactNode }) {
  const profiling = useSyncExternalStore(subscribe, enabled, () => false);
  const pathname = usePathname();
  const navigationStarted = useRef<number | null>(null);
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    if (!profiling || window.__circloVitalsRegistered) return;
    let disposed = false;
    void import("web-vitals").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      if (disposed || window.__circloVitalsRegistered) return;
      // Load the measurement library only for an explicitly requested lab.
      onCLS(vital, { reportAllChanges: true }); onINP(vital, { reportAllChanges: true, durationThreshold: 16 });
      onLCP(vital, { reportAllChanges: true }); onFCP(vital); onTTFB(vital);
      window.__circloVitalsRegistered = true;
    });
    return () => { disposed = true; };
  }, [profiling]);
  useEffect(() => {
    if (!profiling) return;
    record({ kind: "startup", name: "startup-hydrated", value: performance.now() });
    const onNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !routeFamily(url.pathname)) return;
      navigationStarted.current = performance.now();
    };
    document.addEventListener("click", onNavigation, true);
    const resources = new PerformanceObserver(list => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        const name = resourceFamily(entry.name);
        if (name) record({ kind: "request", name, value: Math.max(0, entry.responseEnd - entry.startTime) });
        for (const timing of entry.serverTiming ?? []) {
          if (safeNames.has(timing.name) && Number.isFinite(timing.duration)) record({ kind: "server", name: timing.name, value: timing.duration });
        }
      }
    });
    resources.observe({ type: "resource", buffered: true });
    return () => { document.removeEventListener("click", onNavigation, true); resources.disconnect(); };
  }, [profiling]);
  useEffect(() => {
    if (!profiling || !pathname) return;
    if (previousPath.current !== null && previousPath.current !== pathname && navigationStarted.current !== null) {
      const name = routeFamily(pathname);
      if (name) record({ kind: "navigation", name, value: performance.now() - navigationStarted.current });
      navigationStarted.current = null;
    }
    previousPath.current = pathname;
  }, [pathname, profiling]);
  useEffect(() => {
    if (!profiling || !PerformanceObserver.supportedEntryTypes.includes("longtask")) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) record({ kind: "longtask", name: "main-thread", value: entry.duration });
    });
    observer.observe({ type: "longtask", buffered: true });
    return () => observer.disconnect();
  }, [profiling]);
  // Keep the tree stable when opt-in monitoring initializes. Replacing the
  // wrapper would remount encryption/realtime and restart private startup.
  // React ignores Profiler instrumentation in the ordinary production build.
  return <Profiler id="application" onRender={render}>{children}</Profiler>;
}
