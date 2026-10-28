"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";

export function E2EEStatus() {
  const e2ee = useSharedE2EE();
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]">
          {e2ee.initialized ? (
            <Lock className="h-5 w-5 text-[var(--accent-fg)]" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-[var(--muted)]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            End-to-end encryption
            {e2ee.initialized ? (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--accent-fg)]">
                Active
              </span>
            ) : (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--muted)]">
                {e2ee.loading ? "Setting up…" : "Inactive"}
              </span>
            )}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Your chats, voice messages and media are encrypted on your device
            before they are sent. Circlo cannot read your messages — only
            you and the people you chat with hold the keys.
          </p>
        </div>
      </div>

      <a className="btn btn-secondary mt-4 min-h-11 text-xs" href="/app/settings#privacy">Manage secure devices</a>

    </div>
  );
}
