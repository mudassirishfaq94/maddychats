"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useE2EE } from "@/hooks/use-e2ee";

interface DeviceKey {
  id: string;
  deviceId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Shows users that their chats and data are end-to-end encrypted, lists the
 * devices holding keys for this account, and (by running the E2EE hook) makes
 * sure THIS device has registered its encryption key.
 */
export function E2EEStatus({ userId }: { userId: string }) {
  const e2ee = useE2EE(userId);
  const [devices, setDevices] = useState<DeviceKey[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/e2ee/keys");
        if (res.ok) {
          const data = (await res.json()) as { keys?: DeviceKey[] };
          if (alive) setDevices(data.keys ?? []);
        }
      } catch {
        // best-effort
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
            before they are sent. Maddy Chats cannot read your messages — only
            you and the people you chat with hold the keys.
          </p>
        </div>
      </div>

      {e2ee.loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating secure keys for this device…
        </div>
      ) : e2ee.initialized ? (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-[var(--muted)]">
            <Smartphone className="h-3 w-3" />
            Devices holding your keys
          </p>
          {devices === null ? (
            <p className="mt-1 text-xs text-[var(--muted)]">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              No registered devices yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs"
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent-fg)]" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem]">
                    {d.deviceId}
                  </span>
                  <span className="shrink-0 text-[0.65rem] text-[var(--muted)]">
                    {d.deviceId === e2ee.deviceId ? "This device" : "Other"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <p className="mt-3 text-[0.68rem] leading-relaxed text-[var(--muted)] opacity-80">
        Encryption requires a secure connection. In conversations where the
        other participant hasn&apos;t set up keys yet, Maddy Chats clearly shows
        encryption status on every chat until encryption becomes active.
      </p>
    </div>
  );
}
