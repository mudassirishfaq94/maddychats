"use client";

import { useEffect, useRef } from "react";

const STICKERS = ["👍", "❤️", "😂", "🔥", "🎉", "🥳", "😍", "😭", "🙏", "💯", "🤝", "🫶"];

/** A lightweight first-party sticker tray. Stickers are Unicode-based so they
 * work offline, remain end-to-end encrypted, and do not need a third party. */
export function StickerPicker({ onSelect, onClose }: { onSelect: (sticker: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label="Sticker picker" className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl animate-fade-up">
      <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Stickers</p>
      <div className="grid grid-cols-4 gap-2">
        {STICKERS.map((sticker) => <button key={sticker} type="button" onClick={() => { onSelect(sticker); onClose(); }} className="emoji-button flex aspect-square items-center justify-center rounded-2xl bg-[var(--surface-2)] text-4xl hover:scale-110">{sticker}</button>)}
      </div>
      <p className="mt-3 text-[0.68rem] text-[var(--muted)]">Use the attachment button to send GIF files.</p>
    </div>
  );
}
