"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { AuthStatus, SafeUser } from "@/lib/types";
import type { LoginInput, RegisterInput } from "@/lib/schemas";
import { createInFlightRead } from "@/lib/in-flight-read";
import { invalidateNotificationPreferences } from "@/lib/notification-preference-read";

export interface AuthResult {
  ok: boolean;
  mfaRequired?: boolean;
  verificationRequired?: boolean;
  emailSent?: boolean;
  error?: string;
  fields?: Record<string, string>;
  suggestions?: string[];
}

interface AuthContextValue {
  requestScope: object;
  status: AuthStatus;
  user: SafeUser | null;
  signIn: (input: LoginInput) => Promise<AuthResult>;
  signUp: (input: RegisterInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Global authentication state.
 *
 * On every full page load the provider verifies the session with the backend
 * (`GET /api/auth/me`, which reads the HttpOnly cookie). Nothing about auth
 * is faked via localStorage — the cookie is the single source of truth.
 */
/** Lets the server pick correct cookie Secure/SameSite attributes. */
function secureContextHeader(): Record<string, string> {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return { "x-secure-context": "1" };
  }
  return {};
}

export function AuthProvider({ children, initialUser }: { children: ReactNode; initialUser?: SafeUser | null }) {
  // This snapshot comes from the same server-side eligibility check used by
  // protected pages. Still revalidate through /me on mount and focus; proxy renews expired access.
  const [status, setStatus] = useState<AuthStatus>(initialUser === undefined ? "loading" : initialUser ? "authenticated" : "unauthenticated");
  const [user, setUser] = useState<SafeUser | null>(initialUser ?? null);
  const router = useRouter();
  const mounted = useRef(true);
  const [requestScope, setRequestScope] = useState<object>(() => ({}));
  const scopeRef = useRef(requestScope);
  const identityRef = useRef(initialUser?.id);
  const refreshReads = useRef(createInFlightRead<void>());
  const resetReads = useCallback(() => {
    refreshReads.current.invalidate(scopeRef.current);
    invalidateNotificationPreferences(scopeRef.current);
    const scope = {};
    scopeRef.current = scope;
    setRequestScope(scope);
  }, []);
  const loginRetryAt = useRef(0);
  // Tracks the last time we refreshed the session, so focus/visibility
  // handlers cannot fire a request on every tab switch.
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    const reads = refreshReads.current;
    mounted.current = true;
    lastRefreshAt.current = Date.now();
    return () => {
      mounted.current = false;
      reads.invalidate(scopeRef.current);
      invalidateNotificationPreferences(scopeRef.current);
    };
  }, []);

  const refresh = useCallback(() => {
    const scope = scopeRef.current;
    return refreshReads.current.run(scope, async () => {
    try {
      const res = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!mounted.current || scope !== scopeRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as { user: SafeUser };
        if (!mounted.current || scope !== scopeRef.current) return;
        if (identityRef.current !== data.user.id) resetReads();
        identityRef.current = data.user.id;
        setUser(data.user);
        setStatus("authenticated");
      } else if (res.status === 401) {
        identityRef.current = undefined;
        resetReads();
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch {
      if (!mounted.current || scope !== scopeRef.current) return;
      // A network interruption must not turn a valid, persistent session into
      // an apparent logout. The next focus/heartbeat check will retry it.
      setStatus((previous) => previous === "authenticated" ? previous : "unauthenticated");
    }
    if (mounted.current && scope === scopeRef.current) lastRefreshAt.current = Date.now();
    }).catch(() => undefined); // Invalidated reads cannot publish into a new account.
  }, [resetReads]);

  useEffect(() => {
    // The root already authorized this request. Focus/visibility still revalidate,
    // and every protected API independently enforces current session eligibility.
    if (initialUser !== undefined) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, initialUser]);

  useEffect(() => {
    // Keep the signed cookie rolling for tabs that remain open for days. Also
    // retry as soon as the user returns after sleep or a lost connection.
    //
    // Throttle focus/visibility refreshes: switching tabs and returning from
    // another app would otherwise trigger a GET /api/auth/me on every switch,
    // adding a network round-trip to each tab switch.
    const renew = () => {
      if (Date.now() - lastRefreshAt.current < 30_000) return;
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    const interval = window.setInterval(renew, 6 * 60 * 60 * 1000);
    window.addEventListener("focus", renew);
    document.addEventListener("visibilitychange", renew);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", renew);
      document.removeEventListener("visibilitychange", renew);
    };
  }, [refresh]);

  const signIn = useCallback(
    async (input: LoginInput): Promise<AuthResult> => {
      if (Date.now() < loginRetryAt.current) return {
        ok: false, error: `Please retry sign-in in ${Math.ceil((loginRetryAt.current - Date.now()) / 1000)} seconds.`,
      };
      resetReads();
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...secureContextHeader(),
          },
          body: JSON.stringify(input),
        });
        const data = (await res.json().catch(() => null)) as {
          mfaRequired?: boolean;
          verificationRequired?: boolean;
          emailSent?: boolean;
          user?: SafeUser;
          error?: string;
          fields?: Record<string, string>;
        } | null;
        resetReads();
        if (!res.ok) {
          if (res.status === 503 || res.status === 429) {
            const seconds = Number(res.headers.get("Retry-After") ?? 5);
            loginRetryAt.current = Date.now() + Math.min(60, Math.max(1, Number.isFinite(seconds) ? seconds : 5)) * 1000;
          }
          return {
            ok: false,
            error: data?.error ?? "Something went wrong. Please try again.",
            fields: data?.fields,
            verificationRequired: data?.verificationRequired,
          };
        }
        if (data?.mfaRequired || data?.verificationRequired) return { ok: true, mfaRequired: data.mfaRequired, verificationRequired: data.verificationRequired, emailSent: data.emailSent };
        if (data?.user) {
          identityRef.current = data.user.id;
          setUser(data.user);
          setStatus("authenticated");
        }
        // Optimistic state update avoids a full page reload.
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error. Please try again." };
      }
    },
    [resetReads],
  );

  const signUp = useCallback(
    async (input: RegisterInput): Promise<AuthResult> => {
      resetReads();
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...secureContextHeader(),
          },
          body: JSON.stringify(input),
        });
        const data = (await res.json().catch(() => null)) as {
          mfaRequired?: boolean;
          verificationRequired?: boolean;
          emailSent?: boolean;
          user?: SafeUser;
          error?: string;
          fields?: Record<string, string>;
          suggestions?: string[];
        } | null;
        resetReads();
        if (!res.ok) {
          return {
            ok: false,
            error: data?.error ?? "Something went wrong. Please try again.",
            fields: data?.fields,
            suggestions: data?.suggestions,
            verificationRequired: data?.verificationRequired,
          };
        }
        if (data?.mfaRequired || data?.verificationRequired) return { ok: true, mfaRequired: data.mfaRequired, verificationRequired: data.verificationRequired, emailSent: data.emailSent };
        if (data?.user) {
          identityRef.current = data.user.id;
          setUser(data.user);
          setStatus("authenticated");
        }
        // Optimistic state update avoids a full page reload.
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error. Please try again." };
      }
    },
    [resetReads],
  );

  const signOut = useCallback(async () => {
    resetReads();
    const signedOutUserId = user?.id;
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration("/").then(registration => registration?.active?.postMessage({ type: "CIRCLO_SIGNED_OUT" })).catch(() => {});
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the request fails, clear local state — the cookie is gone or
      // will expire shortly; /api/auth/me remains the source of truth.
    }
    if (signedOutUserId) {
      await import("../../../public/offline-store.js").then(({ forgetOffline }) => forgetOffline(signedOutUserId)).catch(() => {});
      // Best-effort local hygiene. These records are device-encrypted either
      // way, but logout should not retain readable history for this account.
      void import("@/lib/e2ee-message-cache")
        .then(({ clearVerifiedMessageCache }) => clearVerifiedMessageCache(signedOutUserId))
        .catch(() => {});
    }
    resetReads();
    identityRef.current = undefined;
    setUser(null);
    setStatus("unauthenticated");
    router.refresh();
  }, [router, user?.id, resetReads]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signUp, signOut, refresh, requestScope }),
    [status, user, signIn, signUp, signOut, refresh, requestScope],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
