"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { clearAttachmentMediaCache } from "@/components/chats/e2ee-context";
import { useE2EE } from "@/hooks/use-e2ee";
import { useAuth } from "./auth-provider";
const Context = createContext<ReturnType<typeof useE2EE> | null>(null);
function UserEncryption({ userId, children, setupOnly }: { userId?: string; children: ReactNode; setupOnly: boolean }) {
  const encryption = useE2EE(userId);
  useEffect(() => () => clearAttachmentMediaCache(), []);
  const { initialized, getConversationKey, prepareConversation } = encryption;
  useEffect(() => {
    if (!initialized || !userId || setupOnly) return;
    let stopped = false;
    let running = false;
    let queued = false;
    const reconcile = async () => {
      if (running) { queued = true; return; }
      running = true;
      try {
        const response = await fetch("/api/e2ee/message-requests", { cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!response.ok || stopped) return;
        const { conversationIds = [] } = await response.json() as { conversationIds?: string[] };
        // Sequential reconciliation keeps RSA work off the typing hot path.
        for (const id of conversationIds) {
          if (stopped) break;
          try {
            // Never bootstrap/replace a key during background reconciliation.
            await getConversationKey(id);
            await prepareConversation(id);
          } catch { /* A device without the original key must use trusted recovery. */ }
        }
      } catch { /* Offline reconciliation resumes on the next realtime connection. */ }
      finally {
        running = false;
        if (queued && !stopped) { queued = false; void reconcile(); }
      }
    };
    const refresh = () => { void reconcile(); };
    refresh();
    window.addEventListener("maddy:message-request-keys", refresh);
    return () => { stopped = true; window.removeEventListener("maddy:message-request-keys", refresh); };
  }, [initialized, userId, getConversationKey, prepareConversation, setupOnly]);
  return <Context.Provider value={encryption}>{children}</Context.Provider>;
}
export function E2EEProvider({ children, setupOnly = false }: { children: ReactNode; setupOnly?: boolean }) {
  const { user } = useAuth();
  return <UserEncryption key={user?.id ?? "signed-out"} userId={user?.id} setupOnly={setupOnly}>{children}</UserEncryption>;
}
export function useSharedE2EE() {
  const context = useContext(Context);
  if (!context) throw new Error("E2EEProvider is missing");
  return context;
}
