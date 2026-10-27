"use client";
import { useCallback, useEffect, useState } from "react";

/** Private, uncached admin reads. An error envelope must never become page data. */
export function useAdminData<T>(url: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setData(null); setError(null); setLoading(true); setAttempt(value => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const load = () => { if (running || controller.signal.aborted) return; running = true;
    void fetch(url, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        const result = await response.json().catch(() => null);
        if ((response.status === 401 || response.status === 403) && !controller.signal.aborted) setData(null);
        if (!response.ok || result === null) throw new Error(result?.error ?? "Could not load this admin page. Try again, or sign in again if your session expired.");
        if (!controller.signal.aborted) { setData(result as T); setError(null); }
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The request timed out. Check your connection and try again."); })
      .finally(() => { running = false; if (!controller.signal.aborted) setLoading(false); });
    };
    load();
    const visible=()=>{if(document.visibilityState === "visible")load();};
    const timer = refreshMs ? setInterval(visible,refreshMs) : undefined;
    if(refreshMs)document.addEventListener("visibilitychange",visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange",visible); };
  }, [url, attempt, refreshMs]);
  return { data, error, loading, retry };
}
