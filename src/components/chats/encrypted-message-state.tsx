"use client";

import { Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";

/** Only recovery guidance is rendered here, never ciphertext or raw errors. */
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
  if (!unavailable && !introduction) return null;
  return (
    <div className="max-w-xs space-y-2 py-1 text-sm" role="status" aria-live="polite" aria-busy={!unavailable}>
      <div className="flex items-center gap-2 font-medium">
        {unavailable ? <Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {introduction && !deviceError ? "Waiting for secure delivery" : unavailable ? "Message not available yet" : kind === "image" ? "Decrypting photo caption…" : kind === "video" ? "Decrypting video caption…" : kind === "audio" ? "Decrypting voice message…" : kind === "file" ? "Decrypting file details…" : "Decrypting message…"}
      </div>
      {unavailable ? <>
        <p className="text-xs leading-relaxed opacity-90">
          {deviceError ? "This device’s encryption setup needs attention. Open device settings to check approval or recovery."
            : introduction ? "The message request arrived. The sender’s device still needs to share its encryption key. The message will appear automatically when secure delivery completes. You can accept or decline the request above."
            : signal ? "This device has not received its secure copy. Check device approval, then ask the sender to resend if needed."
            : missingKey ? "The key for this message is not available on this device. On a trusted device that can read this chat, open Security and use Restore my other devices. If no device retains the key, this message cannot be recovered."
            : "Secure loading was interrupted. Check your connection and try again. If it continues, check your device’s encryption settings."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!signal && !deviceError ? <button type="button" onClick={() => { setSlow(false); setAttempt(value => value + 1); onRetry(); }} className="min-h-11 rounded-lg border border-current/30 px-3 text-xs font-medium">Try loading again</button> : null}
          <button type="button" onClick={onSecurity} className="min-h-11 rounded-lg border border-current/30 px-3 text-xs font-medium">{deviceError || signal ? "Device settings" : "Security & recovery"}</button>
        </div>
      </> : null}
    </div>
  );
}
