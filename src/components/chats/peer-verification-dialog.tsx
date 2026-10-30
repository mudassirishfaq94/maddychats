"use client";
import { useEffect, useRef, useState } from "react";

export type PeerVerification = { signature: string; devices: Array<{ userId: string; deviceId: string; fingerprint: string }> };

export function PeerVerificationDialog({ review, names, onConfirm, onClose }: {
  review: PeerVerification; names: Record<string, string>; onConfirm: () => void; onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="peer-verification-title" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    }} className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
      <h2 id="peer-verification-title" className="text-lg font-semibold">Check the safety numbers</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Ask each person, through a way you already know them, to open Settings → Privacy → Your phones and sign-in and compare their safety number with the one below.</p>
      {review.devices.length ? <ul className="mt-4 space-y-3">{review.devices.map(device => <li key={`${device.userId}:${device.deviceId}`} className="rounded-xl border border-[var(--border)] p-3 text-xs">
        <p className="font-semibold">{names[device.userId] ?? device.userId}</p>
        <code className="mt-2 block select-all break-all" aria-label="Participant check number">{device.fingerprint}</code>
      </li>)}</ul> : <p className="mt-4 text-sm">No one else is in this chat. Confirm the change you made.</p>}
      <label className="mt-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I compared the numbers and they match.</label>
      <p className="mt-2 text-xs text-[var(--muted)]">If a number doesn&apos;t match, cancel and check with that person.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={!confirmed} onClick={onConfirm} className="btn btn-primary min-h-11">Approve</button>
        <button type="button" onClick={onClose} className="btn min-h-11">Cancel</button>
      </div>
    </section>
  </div>;
}
