"use client";
import { Profiler, useEffect, useSyncExternalStore, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

type Sample = { kind: string; name: string; value: number; phase?: string };
declare global { interface Window { __circloPerformance?: Sample[]; __circloProfilingEnabled?: boolean; __circloVitalsRegistered?: boolean } }
const enabled = () => {
  const value = new URLSearchParams(window.location.search).get("profile") === "1";
  window.__circloProfilingEnabled = value;
  return value;
};
const subscribe = (listener: () => void) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); };
function record(sample: Sample) {
  if (!window.__circloProfilingEnabled || !Number.isFinite(sample.value)) return;
  const samples = window.__circloPerformance ??= [];
  if (sample.kind === "vital") {
    const index = samples.findIndex((entry) => entry.kind === "vital" && entry.name === sample.name);
    if (index >= 0) { samples[index] = sample; return; }
  }
  if (samples.length < 500) samples.push(sample);
}
const render: ProfilerOnRenderCallback = (id, phase, actualDuration) => record({ kind: "react", name: id, phase, value: actualDuration });
const vital = (metric: Metric) => record({ kind: "vital", name: metric.name, value: metric.value });

/** Opt-in, bounded, local-only measurements; no telemetry or message data sent. */
export function PerformanceMonitor({ children }: { children: ReactNode }) {
  const profiling = useSyncExternalStore(subscribe, enabled, () => false);
  useEffect(() => {
    if (!profiling || window.__circloVitalsRegistered) return;
    window.__circloVitalsRegistered = true;
    // Report changing values so foreground/headless labs do not depend on
    // browser backgrounding to obtain CLS and interaction measurements.
    onCLS(vital, { reportAllChanges: true }); onINP(vital, { reportAllChanges: true, durationThreshold: 16 });
    onLCP(vital, { reportAllChanges: true }); onFCP(vital); onTTFB(vital);
  }, [profiling]);
  useEffect(() => {
    if (!profiling || !PerformanceObserver.supportedEntryTypes.includes("longtask")) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) record({ kind: "longtask", name: "main-thread", value: entry.duration });
    });
    observer.observe({ type: "longtask", buffered: true });
    return () => observer.disconnect();
  }, [profiling]);
  return profiling ? <Profiler id="application" onRender={render}>{children}</Profiler> : children;
}
