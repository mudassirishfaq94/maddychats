"use client";
import { discoveryPhone } from "@/lib/phone-numbers";
import { useHydrated } from "@/hooks/use-hydrated";
import { useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/lib/types";

type ContactNavigator = Navigator & { contacts?: { select(fields: string[], options: { multiple: boolean }): Promise<Array<{ tel?: string[] }>> } };
export function PhoneContactFinder({ onResults }: { onResults: (users: PublicUser[]) => void }) {
  const hydrated = useHydrated();
  const supported = hydrated && Boolean((navigator as ContactNavigator).contacts?.select);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lookup = useRef<AbortController | null>(null);
  useEffect(() => () => lookup.current?.abort(), []);
  return <div className="mt-3 space-y-2">
    {supported ? <button type="button" className="btn btn-secondary min-h-11" disabled={busy} onClick={async () => {
      lookup.current?.abort();
      const controller = new AbortController(); lookup.current = controller;
      const deadline = setTimeout(() => controller.abort(), 30000);
      setBusy(true); setMessage("");
      try {
        const selected = await (navigator as ContactNavigator).contacts!.select(["tel"], { multiple: true });
        if (!selected.length) return;
        const numbers = [...new Set(selected.flatMap(contact => contact.tel ?? []).map(value => discoveryPhone(value)))].filter((value): value is string => value !== null).slice(0,10);
        if (!numbers.length) { setMessage("Selected numbers need a +country code. You can also enter a number in search."); return; }
        const matches = new Map<string, PublicUser>();
        // Bound simultaneous requests and never upload the address book or contact names.
        for (let i=0; i<numbers.length; i+=2) {
          const pages = await Promise.all(numbers.slice(i,i+2).map(async number => {
            const res = await fetch(`/api/users/search?q=${encodeURIComponent(number)}`, { cache: "no-store", signal: controller.signal });
            if (!res.ok) throw new Error("Contact lookup could not finish. Try again shortly.");
            return (await res.json()).users as PublicUser[];
          }));
          for (const users of pages) for (const user of users) matches.set(user.id,user);
        }
        if (controller.signal.aborted) return;
        onResults([...matches.values()]);
        setMessage(`Checked ${numbers.length} international numbers (up to 10 per selection). Only people who enabled phone discovery appear. Review their profile before adding them.`);
      } catch (cause) { if (controller.signal.aborted) setMessage("Contact lookup timed out. Please try again."); else if (!(cause instanceof DOMException && cause.name === "AbortError")) setMessage(cause instanceof Error ? cause.message : "Could not open your contacts."); }
      finally { clearTimeout(deadline); setBusy(false); }
    }}>{busy ? "Finding contacts…" : "Find phone contacts"}</button> : <p className="text-xs text-[var(--muted)]">Phone contact selection is unavailable in this browser. Enter an international phone number in search instead.</p>}
    {message ? <p role="status" className="text-xs text-[var(--muted)]">{message}</p> : null}
  </div>;
}
