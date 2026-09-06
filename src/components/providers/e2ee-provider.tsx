"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useE2EE } from "@/hooks/use-e2ee";
import { useAuth } from "./auth-provider";
const Context = createContext<ReturnType<typeof useE2EE> | null>(null);
function UserEncryption({ userId, children }: { userId?: string; children: ReactNode }) {
  const encryption = useE2EE(userId);
  return <Context.Provider value={encryption}>{children}</Context.Provider>;
}
export function E2EEProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <UserEncryption key={user?.id ?? "signed-out"} userId={user?.id}>{children}</UserEncryption>;
}
export function useSharedE2EE() {
  const context = useContext(Context);
  if (!context) throw new Error("E2EEProvider is missing");
  return context;
}
