"use client";

import { useCallback } from "react";
import { isNativeApp } from "@/lib/native-platform";

/**
 * Detects whether the app is running inside a Capacitor Android/iOS shell.
 * In that context, Google OAuth must open in an external browser (Chrome
 * Custom Tab) because Google blocks OAuth in embedded WebViews.
 */
export function GoogleSignIn({ next = "/app" }: { next?: string }) {
  const target = next.startsWith("/") ? next : "/app";
  const href = `/api/auth/google?next=${encodeURIComponent(target)}`;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (isNativeApp()) {
        e.preventDefault();
        // Open Google OAuth in the device browser (Chrome Custom Tab).
        // After auth, Google redirects to ziptalks.vercel.app/api/auth/google/callback
        // which sets the session cookie. The user then returns to the app.
        window.open(href, "_blank");
      }
    },
    [href],
  );

  return (
    <>
      <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[var(--border)]" /><span className="text-xs text-[var(--muted)]">or</span><span className="h-px flex-1 bg-[var(--border)]" /></div>
      <a
        href={href}
        onClick={handleClick}
        className="btn btn-secondary w-full"
      >
        <span aria-hidden="true" className="text-base font-bold">G</span>
        Continue with Google
      </a>
    </>
  );
}
