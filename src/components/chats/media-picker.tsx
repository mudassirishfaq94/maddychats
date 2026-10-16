"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { EmojiPicker } from "./emoji-picker";
import { animatedMediaCatalog, animatedMediaPosterUrl, animatedMediaUrl } from "@/lib/animated-media";
const reducedQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (callback: () => void) => { const query = matchMedia(reducedQuery); query.addEventListener("change", callback); return () => query.removeEventListener("change", callback); };
const reducedMotion = () => matchMedia(reducedQuery).matches;

export function MediaPicker({ anchor, onEmoji, onFile, onClose, mediaDisabled }: {
  anchor: RefObject<HTMLButtonElement | null>; onEmoji: (emoji: string) => void;
  onFile: (file: File) => void; onClose: () => void; mediaDisabled: boolean;
}) {
  const [tab, setTab] = useState<"Emoji" | "Stickers" | "GIFs">("Emoji");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 8, bottom: 80, maxHeight: 320 });
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const reduceMotion = useSyncExternalStore(subscribeMotion, reducedMotion, () => true);
  useEffect(() => () => request.current?.abort(), []);
  useLayoutEffect(() => {
    const place = () => { const rect = anchor.current?.getBoundingClientRect(); if (!rect) return;
      const viewport = window.visualViewport; const bottom = viewport ? viewport.height + viewport.offsetTop : innerHeight;
      const available = rect.top - (viewport?.offsetTop ?? 0) - 16;
      setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - Math.min(360, innerWidth - 16) - 8)), bottom: Math.max(8, innerHeight - (available < 160 ? bottom : Math.min(rect.top, bottom)) + 8), maxHeight: Math.max(80, Math.min(380, available < 160 ? (viewport?.height ?? innerHeight) - 16 : available)) }); };
    // Position before paint so short viewports never display the fallback off-screen.
    place();
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); anchor.current?.focus(); } };
    window.addEventListener("resize", place); window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    return () => { window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [anchor, onClose]);
  async function select(id: string) {
    if (busy || mediaDisabled) return; setBusy(id); setError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch(animatedMediaUrl(id, tab === "GIFs"), { cache: "force-cache", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error("Artwork could not load. Please try again.");
      const bytes = await response.blob(); if (bytes.size > 256 * 1024) throw new Error("Artwork is too large.");
      if (controller.signal.aborted) return;
      onFile(new File([bytes], `circlo-${id}.${tab === "GIFs" ? "gif" : "webp"}`, { type: tab === "GIFs" ? "image/gif" : "image/webp" })); onClose();
    } catch { if (!controller.signal.aborted) setError("Could not load the animation. Check your connection and try again."); }
    finally { if (!controller.signal.aborted) setBusy(null); request.current = null; }
  }
  if (typeof document === "undefined") return null;
  const items = animatedMediaCatalog(tab === "GIFs").filter(item => `${item.label} ${item.tags}`.toLowerCase().includes(search.toLowerCase()));
  return createPortal(<div ref={ref} role="dialog" aria-label="Emoji, stickers and GIFs" style={position} className="fixed z-[150] flex w-[min(360px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
    <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] p-1.5">
      <div className="flex min-w-0 flex-1" role="tablist" aria-label="Express yourself">{(["Emoji", "Stickers", "GIFs"] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} type="button" onClick={() => { setTab(value); setSearch(""); setError(null); }} className={`min-h-11 flex-1 rounded-xl px-2 text-sm ${tab === value ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)]"}`}>{value}</button>)}</div>
      <button type="button" aria-label="Close media picker" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center"><X className="h-5 w-5" /></button>
    </div>
    <div className="min-h-0 overflow-y-auto overscroll-contain" role="tabpanel" aria-label={tab}>
      {tab === "Emoji" ? <EmojiPicker embedded onSelect={onEmoji} onClose={onClose} /> : <div className="p-3">
        <input aria-label="Search animations" placeholder="Search animations…" value={search} onChange={event => setSearch(event.target.value)} className="field-input mb-3 w-full" />
        {mediaDisabled ? <p className="mb-3 text-xs text-[var(--muted)]">Animated media becomes available when secure attachments are ready.</p> : null}
        {error ? <p role="alert" className="mb-3 text-sm">{error}</p> : null}
        <div className="grid grid-cols-3 gap-2">{items.map(item => <button key={item.id} type="button" disabled={mediaDisabled || busy !== null} onClick={() => void select(item.id)} aria-label={`Add ${item.label} ${tab === "GIFs" ? "GIF" : "sticker"}`} className="relative rounded-xl bg-[var(--surface-2)] p-1 disabled:opacity-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={reduceMotion ? animatedMediaPosterUrl(item.id, tab === "GIFs") : animatedMediaUrl(item.id, tab === "GIFs")} alt="" loading="lazy" className="aspect-square w-full object-contain" />
          <span className="block pb-1 text-xs">{item.label}</span>{busy === item.id ? <Loader2 className="absolute left-1/2 top-1/2 h-5 w-5 animate-spin" /> : null}
        </button>)}</div>
        {!items.length ? <p className="py-4 text-sm text-[var(--muted)]">No matching animations.</p> : null}
        <button type="button" disabled={mediaDisabled || busy !== null} onClick={() => input.current?.click()} className="btn btn-secondary mt-3 min-h-11 w-full">Upload your own GIF</button>
        <input ref={input} aria-label="Choose GIF" type="file" accept="image/gif,.gif" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) { if (file.type !== "image/gif" || file.size > 10 * 1024 * 1024) setError("Choose a GIF up to 10 MB."); else { onFile(file); onClose(); } } event.target.value = ""; }} />
        <p className="mt-3 text-xs text-[var(--muted)]">First-party artwork. Sent through encrypted attachments.</p>
      </div>}
    </div>
  </div>, document.body);
}
