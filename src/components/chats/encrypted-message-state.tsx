"use client";

import { Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";

/** Plain-language loading and failure states; never raw errors or technical detail. */
export function EncryptedMessageState({ failed, missingKey, deviceError, signal, introduction = false, kind = "text", onRetry, onSecurity }: {
  failed: boolean; missingKey: boolean; deviceError: boolean; signal: boolean;
  introduction?: boolean;
  kind?: string;
  onRetry: () => void; onSecurity: () => void;
}) {
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (failed || deviceError || signal) return;
    const timer = setTimeout(() => setSlow(true), 30000);
    return () => clearTimeout(timer);
  }, [failed, deviceError, signal, attempt]);
  const unavailable = failed || deviceError || signal || slow;
  return (
    <div className="max-w-xs space-y-2 py-1 text-sm" role="status" aria-live="polite" aria-busy={!unavailable}>
      <div className="flex items-center gap-2 font-medium">
        {unavailable ? <Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {unavailable ? "Couldn't load" : introduction ? "Waiting…" : "Loading…"}
      </div>
      {unavailable ? <>
        <p className="text-xs leading-relaxed opacity-90">
          {deviceError ? "This phone isn't set up yet. Open settings to finish."
            : introduction ? "It will appear here when they open Circlo."
            : signal ? "Ask them to send it again."
            : missingKey ? "This message can't be opened on this phone. Open it on a phone that can already read this chat."
            : "Couldn't load. Check your connection and try again."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!signal && !deviceError ? <button type="button" onClick={() => { setSlow(false); setAttempt(value => value + 1); onRetry(); }} className="min-h-11 rounded-lg border border-current/30 px-3 text-xs font-medium">Tap to retry</button> : null}
          <button type="button" onClick={onSecurity} className="min-h-11 rounded-lg border border-current/30 px-3 text-xs font-medium">{deviceError || signal ? "Open settings" : "Security & recovery"}</button>
        </div>
      </> : null}
    </div>
  );
}
