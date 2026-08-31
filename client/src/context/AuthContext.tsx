import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import type { AuthStatus, User } from "../types";

export type RegisterPayload = {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type LoginPayload = {
  identifier: string;
  password: string;
};

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  register: (payload: RegisterPayload) => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // Verify the session with the backend. The JWT lives in an HttpOnly cookie,
  // so the only source of truth is the server — never localStorage.
  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>("/auth/me");
      setUser(data.user);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const data = await api.post<{ user: User }>("/auth/register", payload);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const data = await api.post<{ user: User }>("/auth/login", payload);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, register, login, logout, refresh }),
    [user, status, register, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
