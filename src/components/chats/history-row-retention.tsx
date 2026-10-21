"use client";
import { createContext, useContext, useEffect } from "react";

export const HistoryRowRetention = createContext<((id: string, active: boolean) => void) | null>(null);

/** A portalled viewer still belongs to its message even when incoming output scrolls past it. */
export function useRetainHistoryRow(id: string | undefined, active: boolean) {
  const retain = useContext(HistoryRowRetention);
  useEffect(() => {
    if (!id || !active || !retain) return;
    retain(id, true);
    return () => retain(id, false);
  }, [id, active, retain]);
}
