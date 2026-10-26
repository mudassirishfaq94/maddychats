"use client";

import Link from "next/link";

interface FreshAuthenticationProps {
  password: string;
  code: string;
  onPassword: (value: string) => void;
  onCode: (value: string) => void;
  returnTo?: string;
  submitLabel?: string;
}

/** Re-verification fields are only used by sensitive actions. They are never
 * forwarded as body fields through the admin mutation pipeline; admin pages
 * that need primary-credential re-verification do it through the login flow
 * instead, so the password and one-time code never enter a PATCH/PUT request.
 */
export function FreshAuthentication({
  password,
  code,
  onPassword,
  onCode,
  returnTo = "/app/profile",
  submitLabel,
}: FreshAuthenticationProps) {
  return (
    <div className="my-3 space-y-2">
      <p className="text-xs text-[var(--muted)]">
        If you signed in more than five minutes ago, enter your password and,
        if enabled, a code from your code app or saved backup list. Google
        accounts can sign in again instead.
      </p>
      {submitLabel ? (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] p-3">
          <p className="text-xs text-[var(--danger)]">
            For this action, sign in again using the link below.
          </p>
          <Link
            className="mt-2 block text-xs text-[var(--accent)]"
            href={`/login?reauth=1&next=${encodeURIComponent(returnTo)}`}
          >
            {submitLabel}
          </Link>
        </div>
      ) : (
        <>
          <label className="block text-xs">
            Current password
            <input
              className="field-input mt-1"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              maxLength={72}
            />
          </label>
          <label className="block text-xs">
            Code from your code app or saved backup list (if enabled)
            <input
              className="field-input mt-1"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => onCode(e.target.value)}
              maxLength={40}
            />
          </label>
          <Link
            className="block text-xs text-[var(--accent)]"
            href={`/login?reauth=1&next=${encodeURIComponent(returnTo)}`}
          >
            Sign in again to confirm it’s you
          </Link>
        </>
      )}
    </div>
  );
}

