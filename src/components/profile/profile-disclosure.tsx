"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function ProfileDisclosure({ title, description, anchors = [], defaultOpen = false, children }: { title: string; description: string; anchors?: string[]; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const [loaded, setLoaded] = useState(defaultOpen);
  const anchorKey = anchors.join(",");
  useEffect(() => {
    const reveal = () => {
      if (anchorKey && anchorKey.split(",").includes(window.location.hash.slice(1))) {
        setOpen(true); setLoaded(true);
        requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" }));
      }
    };
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [anchorKey]);
  return <details open={open} onToggle={event => { const next = event.currentTarget.open; setOpen(next); if (next) setLoaded(true); }} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-1 block text-xs text-[var(--muted)]">{description}</span></span>
      <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </summary>
    {loaded ? <div className="min-w-0 space-y-4 border-t border-[var(--border)] p-3 sm:p-4">{children}</div> : null}
  </details>;
}
