/** Opt-in client timing without message content or identifiers in production logs. */
export function chatPerf(event: string, startedAt: number, extra?: Record<string, number | string>) {
  if (typeof window === "undefined" || window.localStorage.getItem("circlo:perf") !== "1") return;
  console.debug("[chat-perf]", event, {
    elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
    ...extra,
  });
}
