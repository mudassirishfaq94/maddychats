"use client";

import { useCallback } from "react";
import { isNativeApp } from "@/lib/native-platform";
import type { PolicyConsent } from "@/lib/policy-consent";

/**
 * Detects whether the app is running inside a Capacitor Android/iOS shell.
 * In that context, Google OAuth must open in an external browser (Chrome
 * Custom Tab) because Google blocks OAuth in embedded WebViews.
 */
export function GoogleSignIn({ next = "/app", consent }: { next?: string; consent?: PolicyConsent }) {
  const target = next.startsWith("/") ? next : "/app";
  const allowed = !consent || (consent.acceptTerms && consent.acceptPrivacy);
  const href = `/api/auth/google?next=${encodeURIComponent(target)}${consent && allowed ? "&terms=1&privacy=1" : ""}`;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!allowed) { e.preventDefault(); return; }
      if (isNativeApp()) {
        e.preventDefault();
        // Open Google OAuth in the device browser (Chrome Custom Tab).
        // After auth, Google redirects to the configured Circlo callback.
        // which sets the session cookie. The user then returns to the app.
        window.open(href, "_blank");
      }
    },
    [href, allowed],
  );

  return (
    <>
      <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[var(--border)]" /><span className="text-xs text-[var(--muted)]">or</span><span className="h-px flex-1 bg-[var(--border)]" /></div>
      <a
        role="link"
        href={allowed ? href : undefined}
        aria-disabled={!allowed}
        tabIndex={allowed ? 0 : -1}
        onClick={handleClick}
        className={`btn btn-secondary w-full ${allowed ? "" : "opacity-50 cursor-not-allowed"}`}
      >
        <span aria-hidden="true" className="text-base font-bold">G</span>
        Continue with Google
      </a>
    </>
  );
}
