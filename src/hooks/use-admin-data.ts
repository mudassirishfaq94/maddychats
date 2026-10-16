"use client";
import { useCallback, useEffect, useState } from "react";

/** Private, uncached admin reads. An error envelope must never become page data. */
export function useAdminData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setData(null); setError(null); setLoading(true); setAttempt(value => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        const result = await response.json().catch(() => null);
        if (!response.ok || result === null) throw new Error(result?.error ?? "Could not load this admin page. Try again, or sign in again if your session expired.");
        if (!controller.signal.aborted) setData(result as T);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "The request timed out. Check your connection and try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, attempt]);
  return { data, error, loading, retry };
}
