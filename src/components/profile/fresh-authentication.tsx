"use client";

import Link from "next/link";

/** Credentials are sent only with the sensitive action; never persisted. */
export function FreshAuthentication({ password, code, onPassword, onCode, returnTo = "/app/profile" }: {
  password: string; code: string; onPassword: (value: string) => void; onCode: (value: string) => void;
  returnTo?: string;
}) {
  return <div className="my-3 space-y-2">
    <p className="text-xs text-[var(--muted)]">If you signed in more than five minutes ago, confirm your password and, when enabled, your authenticator or recovery code. Google/phone accounts can sign in again instead.</p>
    <label className="block text-xs">Current password
      <input className="field-input mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => onPassword(e.target.value)} maxLength={72} />
    </label>
    <label className="block text-xs">Authenticator or recovery code (if enabled)
      <input className="field-input mt-1" autoComplete="one-time-code" value={code} onChange={(e) => onCode(e.target.value)} maxLength={40} />
    </label>
    <Link className="block text-xs text-[var(--accent)]" href={`/login?reauth=1&next=${encodeURIComponent(returnTo)}`}>Sign in again to confirm your identity</Link>
  </div>;
}
