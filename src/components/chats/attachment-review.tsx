"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Lock, Loader2, Send, Trash2, X } from "lucide-react";
import type { PendingFile } from "./attachment-composer";
import { humanSize } from "./attachments";

export function AttachmentReview(props: {
  pending: PendingFile[]; progress: number | null; phase: "encrypting" | "uploading" | "finishing" | null;
  busy: boolean; caption: string; error: string | null;
  onCaptionChange: (caption: string) => void; onSend: () => void; onRemove: (id: string) => void;
  onCaptionInput: (caption: string) => void;
  onCancel: () => void; onClear: () => void;
}) {
  return props.pending.length ? <Review {...props} /> : null;
}

function Review({ pending, progress, phase, busy, caption, error, onCaptionChange, onCaptionInput, onSend, onRemove, onCancel, onClear }: Parameters<typeof AttachmentReview>[0]) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const [selectedId, setSelectedId] = useState(pending[0].id);
  const [previewFailures,setPreviewFailures]=useState<Set<string>>(()=>new Set());
  const previewFailed=()=>setPreviewFailures(previous=>new Set(previous).add(selected.id));
  const selected = pending.find(file => file.id === selectedId) ?? pending[0];
  useLayoutEffect(() => {
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const place = () => {
      const viewport = window.visualViewport, available = viewport?.height ?? innerHeight;
      const height = innerWidth < 640 ? available : Math.min(820, available * 0.94);
      element.style.height = `${height}px`; element.style.maxHeight = `${available}px`;
      element.style.top = `${(viewport?.offsetTop ?? 0) + (available - height) / 2}px`;
      element.style.bottom = "auto"; element.style.marginTop = "0"; element.style.marginBottom = "0";
    };
    place(); window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place);
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow;
      window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place);
      if (previous?.isConnected) previous.focus(); };
  }, []);
  const remember = () => onCaptionChange(input.current?.value ?? caption);
  const close = () => { if (!busy) { remember(); onClear(); } };
  const status = phase === "encrypting" ? "Preparing…" : phase === "finishing" ? "Almost done…" : `Uploading · ${Math.max(0, Math.min(100, progress ?? 0))}%`;
  return createPortal(<dialog ref={dialog} aria-label="Review attachments" onCancel={event => { event.preventDefault(); close(); }}
    className="fixed m-auto h-[100dvh] max-h-[100dvh] w-screen max-w-none border-0 bg-[var(--bg)] p-0 text-[var(--text)] backdrop:bg-black/70 sm:max-w-4xl sm:rounded-3xl sm:border sm:border-[var(--border)]">
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" aria-label="Discard selected files" disabled={busy} onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-2)] disabled:opacity-40"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><h2 className="font-display text-lg font-semibold">A little more to share</h2><p className="truncate text-xs text-[var(--muted)]">{pending.length} of 5 files · Preview before you send</p></div>
        <Lock aria-label="End-to-end encrypted" className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" />
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--surface-2)] p-3 sm:p-6">
        {previewFailures.has(selected.id) ? <div className="max-w-xs rounded-2xl bg-[var(--surface)] p-5 text-center"><FileText className="mx-auto mb-3 h-8 w-8 text-[var(--accent-fg)]" /><p className="break-all text-sm font-semibold">{selected.file.name}</p><p className="mt-2 text-xs text-[var(--muted)]">Preview isn&apos;t supported on this device. You can still send the original file securely.</p></div> : selected.previewUrl && selected.file.type.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selected.previewUrl} alt={selected.file.name} onError={previewFailed} className="h-full max-h-full w-full object-contain" />
        ) : selected.previewUrl && selected.file.type.startsWith("video/") ? <video key={selected.id} src={selected.previewUrl} onError={previewFailed} controls playsInline preload="metadata" className="h-full max-h-full w-full object-contain" />
          : <div className="min-w-0 max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center"><FileText className="mx-auto mb-4 h-10 w-10 text-[var(--accent-fg)]" /><p className="break-all text-sm font-medium">{selected.file.name}</p><p className="mt-2 text-xs text-[var(--muted)]">{humanSize(selected.file.size)}</p>{selected.previewUrl && selected.file.type.startsWith("audio/") ? <audio key={selected.id} src={selected.previewUrl} controls preload="metadata" className="mt-4 w-full" /> : null}</div>}
      </div>
      <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Selected files">
          {pending.map((file, index) => <button key={file.id} type="button" disabled={busy} onClick={() => setSelectedId(file.id)} aria-label={`Preview ${file.file.name}`} aria-pressed={file.id === selected.id}
            className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 ${file.id === selected.id ? "border-[var(--action)]" : "border-[var(--border)]"}`}>
            {file.previewUrl && file.file.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.previewUrl} alt="" className="h-full w-full object-cover" />
            ) : <span className="text-xs font-semibold">{index + 1}</span>}
          </button>)}
          <button type="button" disabled={busy} onClick={() => { remember(); onRemove(selected.id); }} aria-label={`Remove ${selected.file.name}`} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"><Trash2 className="h-4 w-4" />Remove</button>
        </div>
        {busy ? <div role="status" className="mb-3 rounded-2xl bg-[var(--surface-2)] p-3"><div className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 shrink-0 animate-spin" /><span className="min-w-0 flex-1">{status}</span>{phase !== "finishing" ? <button type="button" onClick={onCancel} className="min-h-9 px-2 font-semibold">Cancel upload</button> : null}</div>{phase === "uploading" ? <progress aria-label="Upload progress" value={Math.max(0, Math.min(100, progress ?? 0))} max={100} className="mt-2 h-1.5 w-full accent-[var(--action)]" /> : null}</div> : null}
        {error && !busy ? <p role="alert" className="mb-2 rounded-xl bg-[var(--surface-2)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}
        <div className="flex items-end gap-2"><textarea ref={input} defaultValue={caption} onChange={event => onCaptionInput(event.target.value)} disabled={busy} aria-label="Attachment caption" placeholder="Add a caption…" rows={2} maxLength={2000} className="field-input max-h-28 min-w-0 flex-1 resize-none text-base" />
          <button type="button" aria-label="Send attachments" disabled={busy} onClick={() => { remember(); onSend(); }} className="btn btn-primary h-12 w-12 shrink-0 rounded-full! p-0!">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">Files and captions are encrypted before leaving this device.</p>
      </footer>
    </div>
  </dialog>, document.body);
}
