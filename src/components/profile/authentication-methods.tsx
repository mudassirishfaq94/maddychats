"use client";

import { useState } from "react";
import { Check, KeyRound, Link2, Mail } from "lucide-react";

export interface AuthenticationMethodState {
  email: boolean;
  google: boolean;
}

function MethodRow({
  icon: Icon,
  label,
  connected,
  children,
}: {
  icon: typeof Mail;
  label: string;
  connected: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-3 sm:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent-fg)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          {connected ? <><Check className="h-3.5 w-3.5 text-[var(--success)]" />Connected</> : "Not connected"}
        </p>
      </div>
      {!connected ? children : null}
    </div>
  );
}

export function AuthenticationMethods({
  initialMethods,
  notice,
}: {
  initialMethods: AuthenticationMethodState;
  notice?: { kind: "success" | "error"; text: string } | null;
}) {
  const [methods] = useState(initialMethods);
  const [error] = useState<string | null>(notice?.kind === "error" ? notice.text : null);

  return (
    <section className="card-glass min-w-0 rounded-3xl p-4 sm:p-8 animate-fade-up">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent-fg)]"><KeyRound className="h-4 w-4" /></span>
        <div>
          <h2 className="font-display text-xl font-bold">Authentication methods</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Connect secure ways to access this same account.</p>
        </div>
      </div>

      {notice?.kind === "success" ? <p className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-4 py-3 text-sm text-[var(--success)]">{notice.text}</p> : null}
      {error ? <p role="alert" className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-6 space-y-3">
          <MethodRow icon={Mail} label="Email and password" connected={methods.email}>
            <span className="text-xs text-[var(--muted)]">Email setup is coming soon</span>
          </MethodRow>
          <MethodRow icon={Link2} label="Google" connected={methods.google}>
            <a href="/api/auth/google?mode=link&next=/app/profile" className="btn btn-secondary">Add Google</a>
          </MethodRow>
      </div>
      <p className="mt-5 text-xs leading-relaxed text-[var(--muted)]">If a method belongs to another ZipTalk account, linking stops and shows a conflict. Accounts and chat histories are never merged automatically.</p>
    </section>
  );
}
