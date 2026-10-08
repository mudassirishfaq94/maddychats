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
import { clearVerifiedMessageCache } from "@/lib/e2ee-message-cache";

export interface AuthResult {
  ok: boolean;
  mfaRequired?: boolean;
  verificationRequired?: boolean;
  error?: string;
  fields?: Record<string, string>;
}

interface AuthContextValue {
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SafeUser | null>(null);
  const router = useRouter();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!mounted.current) return;
      if (res.ok) {
        const data = (await res.json()) as { user: SafeUser };
        setUser(data.user);
        setStatus("authenticated");
      } else if (res.status === 401) {
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch {
      if (!mounted.current) return;
      // A network interruption must not turn a valid, persistent session into
      // an apparent logout. The next focus/heartbeat check will retry it.
      setStatus((previous) => previous === "authenticated" ? previous : "unauthenticated");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    // Keep the signed cookie rolling for tabs that remain open for days. Also
    // retry as soon as the user returns after sleep or a lost connection.
    const renew = () => {
      if (document.visibilityState === "visible") void refresh();
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
          user?: SafeUser;
          error?: string;
          fields?: Record<string, string>;
        } | null;
        if (!res.ok) {
          return {
            ok: false,
            error: data?.error ?? "Something went wrong. Please try again.",
            fields: data?.fields,
            verificationRequired: data?.verificationRequired,
          };
        }
        if (data?.mfaRequired || data?.verificationRequired) return { ok: true, mfaRequired: data.mfaRequired, verificationRequired: data.verificationRequired };
        if (data?.user) {
          setUser(data.user);
          setStatus("authenticated");
        }
        router.refresh();
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error. Please try again." };
      }
    },
    [router],
  );

  const signUp = useCallback(
    async (input: RegisterInput): Promise<AuthResult> => {
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
          user?: SafeUser;
          error?: string;
          fields?: Record<string, string>;
        } | null;
        if (!res.ok) {
          return {
            ok: false,
            error: data?.error ?? "Something went wrong. Please try again.",
            fields: data?.fields,
            verificationRequired: data?.verificationRequired,
          };
        }
        if (data?.mfaRequired || data?.verificationRequired) return { ok: true, mfaRequired: data.mfaRequired, verificationRequired: data.verificationRequired };
        if (data?.user) {
          setUser(data.user);
          setStatus("authenticated");
        }
        router.refresh();
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error. Please try again." };
      }
    },
    [router],
  );

  const signOut = useCallback(async () => {
    const signedOutUserId = user?.id;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the request fails, clear local state — the cookie is gone or
      // will expire shortly; /api/auth/me remains the source of truth.
    }
    if (signedOutUserId) {
      // Best-effort local hygiene. These records are device-encrypted either
      // way, but logout should not retain readable history for this account.
      void clearVerifiedMessageCache(signedOutUserId).catch(() => {});
    }
    setUser(null);
    setStatus("unauthenticated");
    router.refresh();
  }, [router, user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signUp, signOut, refresh }),
    [status, user, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
