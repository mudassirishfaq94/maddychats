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
        {unavailable ? missingKey ? "Message unavailable" : "Couldn't open this message" : introduction ? "Waiting…" : "Opening…"}
      </div>
      {unavailable ? <>
        <p className="text-xs leading-relaxed opacity-90">
          {deviceError ? "Private chats aren't ready on this phone. Open settings to finish."
            : introduction ? "It will appear here when they open Circlo."
            : signal ? "This message needs an update. Ask them to send it again."
            : missingKey ? "This phone doesn't have this chat yet. Link the phone that can still open it and send its chat history."
            : "Check your connection, then try again."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!signal && !deviceError ? <button type="button" onClick={() => { setSlow(false); setAttempt(value => value + 1); onRetry(); }} className="min-h-11 rounded-lg border border-current/30 px-3 text-xs font-medium">Try again</button> : null}
          <button type="button" onClick={onSecurity} className="min-h-11 rounded-lg border border-current/30 px-3 text-xs font-medium">{deviceError ? "Open settings" : signal ? "Message help" : missingKey ? "How to bring chats over" : "Message help"}</button>
        </div>
      </> : null}
    </div>
  );
}
