"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChallengeAction } from "@/server/turnstile";

type Widget = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global { interface Window { turnstile?: Widget } }

let scriptReady: Promise<void> | undefined;
function loadWidget() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptReady) scriptReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "";
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("timeout")); }, 15000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("load")); };
    document.head.append(script);
  }).catch(error => { scriptReady = undefined; throw error; });
  return scriptReady;
}

export function useSecurityCheck(action: ChallengeAction) {
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/challenge", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("config");
        const config = await response.json() as { enabled: boolean; siteKey: string | null };
        if (!active) return;
        if (config.enabled !== true && config.enabled !== false) throw new Error("config");
        setEnabled(config.enabled);
        if (!config.enabled) return;
        if (!config.siteKey) throw new Error("config");
        await loadWidget();
        if (!active || !element.current || !window.turnstile) return;
        widget.current = window.turnstile.render(element.current, {
          sitekey: config.siteKey, action, size: "flexible", theme: "auto",
          callback: (value: string) => { if (active) { setToken(value); setError(false); } },
          "expired-callback": () => { if (active) setToken(""); },
          "error-callback": () => { if (active) { setToken(""); setError(true); } },
          "timeout-callback": () => { if (active) { setToken(""); setError(true); } },
        });
      } catch { if (active) setError(true); }
    })();
    return () => {
      active = false;
      if (widget.current !== undefined) window.turnstile?.remove(widget.current);
      widget.current = undefined;
    };
  }, [action, attempt]);
  const reset = useCallback(() => {
    setToken("");
    if (widget.current !== undefined) window.turnstile?.reset(widget.current);
  }, []);
  const retry = () => { setToken(""); setError(false); setEnabled(undefined); setAttempt(value => value + 1); };
  return {
    token, ready: !error && (enabled === false || Boolean(token)), reset,
    field: <div className="min-w-0 space-y-2">
      <div ref={element} />
      {error ? <p role="alert" className="text-sm">The security check couldn’t load. Check your connection, then <button type="button" className="underline" onClick={retry}>try again</button>.</p>
        : enabled !== false && !token ? <p role="status" className="text-sm text-[var(--muted)]">Checking your connection securely…</p> : null}
    </div>,
  };
}
