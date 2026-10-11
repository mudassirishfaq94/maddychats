"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Loader2,
  Play,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AttachmentDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEncryptedAttachmentUrl } from "./e2ee-context";

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentIcon({ mime, className }: { mime: string; className: string }) {
  if (mime.includes("pdf")) return <FileText className={className} />;
  if (mime.includes("zip")) return <FileArchive className={className} />;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className={className} />;
  if (mime.startsWith("text/")) return <FileText className={className} />;
  return <FileIcon className={className} />;
}

/** Full-screen media viewer with next/prev navigation. */
export function Lightbox({
  src,
  alt,
  images,
  currentIndex,
  onClose,
  onNavigate,
}: {
  src: string;
  alt: string;
  images?: AttachmentDTO[];
  currentIndex?: number;
  onClose: () => void;
  onNavigate?: (index: number) => void;
}) {
  const current = images?.[currentIndex ?? 0];
  const resolved = useEncryptedAttachmentUrl(current);
  // The active image may be E2EE — use the decrypted object URL when ready.
  const activeSrc = current?.encrypted ? (resolved.url ?? "") : src;
  const [mediaState, setMediaState] = useState<{ src: string; status: "loaded" | "failed" } | null>(null);
  const status = mediaState?.src === activeSrc ? mediaState.status : "loading";
  const loading = status === "loading";
  const failed = status === "failed";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const zoomed = zoomedSrc === activeSrc && Boolean(activeSrc);

  const goNext = useCallback(() => {
    if (images && currentIndex !== undefined && onNavigate) {
      onNavigate((currentIndex + 1) % images.length);
    }
  }, [images, currentIndex, onNavigate]);

  const goPrev = useCallback(() => {
    if (images && currentIndex !== undefined && onNavigate) {
      onNavigate((currentIndex - 1 + images.length) % images.length);
    }
  }, [images, currentIndex, onNavigate]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "Tab") {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose, goNext, goPrev]);

  const hasNav = images && images.length > 1 && currentIndex !== undefined;
  const downloadHref = current?.encrypted ? (resolved.url ?? undefined) : src;
  const isDecrypting = Boolean(current?.encrypted && !resolved.url && !resolved.failed);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[200] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#101113] text-white"
    >
      {/* Top controls */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
        <p className="min-w-0 flex-1 truncate text-sm text-white/80">{alt}</p>
        {current?.kind !== "video" ? (
          <button type="button" disabled={loading || failed || !activeSrc} onClick={() => setZoomedSrc(zoomed ? null : activeSrc)} aria-label={zoomed ? "Fit image to screen" : "Zoom image"} aria-pressed={zoomed} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">
            {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
          </button>
        ) : null}
        <a
          href={downloadHref}
          download={alt}
          aria-disabled={!downloadHref}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Download image"
        >
          <Download className="h-4.5 w-4.5" />
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Counter */}
      {hasNav ? (
        <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-sm font-medium text-white/70 z-10 rounded-full bg-black/70 px-3 py-1">
          {(currentIndex ?? 0) + 1} / {images!.length}
        </div>
      ) : null}

      {/* Previous */}
      {hasNav ? (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous image"
          className="absolute left-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 z-10"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      ) : null}

      {/* Next */}
      {hasNav ? (
        <button
          type="button"
          onClick={goNext}
          aria-label="Next image"
          className="absolute right-4 top-1/2 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 z-10"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      ) : null}

      <div className={cn("min-h-0 w-full flex-1 overflow-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]", zoomed ? "block" : "flex items-center justify-center p-3 sm:p-6")} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {isDecrypting ? (
        <div className="flex flex-col items-center gap-3 text-white/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Decrypting securely…</p>
        </div>
      ) : null}
      {!isDecrypting && !resolved.failed && loading && !failed ? (
        <div role="status" className="flex flex-col items-center gap-3 text-white/80"><Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" /><p className="text-sm">Loading your image, please wait…</p></div>
      ) : null}
      {resolved.failed || (!isDecrypting && failed) ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-white/75">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm">{resolved.failed ? "This device could not decrypt this media. Check Security & recovery from the chat." : "This media could not be loaded. Check your connection, then close and reopen it."}</p>
        </div>
      ) : null}
      {!isDecrypting && activeSrc ? (
        images?.[currentIndex ?? 0]?.kind === "video" ? (
          <video
            key={activeSrc}
            src={activeSrc}
            controls
            autoPlay
            preload="metadata"
            onLoadedData={() => setMediaState({ src: activeSrc, status: "loaded" })}
            onError={() => setMediaState({ src: activeSrc, status: "failed" })}
            className={cn(
              "max-h-full max-w-full object-contain",
              (loading || failed) && "invisible absolute",
            )}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={activeSrc}
            src={activeSrc}
            alt={alt}
            onDoubleClick={() => setZoomedSrc(zoomed ? null : activeSrc)}
            style={zoomed ? { width: "200%", maxWidth: "none", maxHeight: "none" } : undefined}
            onLoad={() => setMediaState({ src: activeSrc, status: "loaded" })}
            onError={() => setMediaState({ src: activeSrc, status: "failed" })}
            className={cn(
              "block max-h-full max-w-full object-contain",
              (loading || failed) && "invisible absolute",
            )}
          />
        )
      ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Attachment grid rendered inside a message bubble. */
export function AttachmentList({
  attachments,
  own,
}: {
  attachments: AttachmentDTO[];
  own: boolean;
}) {
  const [lightbox, setLightbox] = useState<AttachmentDTO | null>(null);
  if (attachments.length === 0) return null;

  const media = attachments.filter(
    (a) => a.kind === "image" || a.kind === "video",
  );
  const files = attachments.filter((a) => a.kind === "file");

  return (
    <div className="space-y-2">
      {media.length > 0 ? (
        <div
          className={cn(
            "grid gap-1.5",
            media.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {media.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLightbox(item)}
              className="group/img relative overflow-hidden rounded-xl"
              aria-label={`View ${item.originalName}`}
            >
              <InlineMedia attachment={item} />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover/img:bg-black/25 group-hover/img:opacity-100">
                {item.kind === "video" ? (
                  <Play className="h-7 w-7 fill-white text-white" />
                ) : (
                  <ZoomIn className="h-6 w-6 text-white" />
                )}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {files.map((f) => (
        <FileChip key={f.id} file={f} own={own} />
      ))}

      {lightbox ? (
        <Lightbox
          src={lightbox.url}
          alt={lightbox.originalName}
          images={media.length > 0 ? media : undefined}
          currentIndex={media.findIndex((i) => i.id === lightbox.id)}
          onClose={() => setLightbox(null)}
          onNavigate={(idx) => setLightbox(media[idx])}
        />
      ) : null}
    </div>
  );
}

/** A downloadable file chip that transparently decrypts E2EE files. */
function FileChip({ file, own }: { file: AttachmentDTO; own: boolean }) {
  const { url, failed } = useEncryptedAttachmentUrl(file);
  const unavailable = Boolean(file.encrypted && (failed || !url));
  return (
    <span
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        own
          ? "border-[color-mix(in_srgb,var(--bubble-own-fg)_20%,transparent)] bg-[color-mix(in_srgb,var(--bubble-own-fg)_8%,transparent)]"
          : "border-[var(--border)] bg-[var(--card-2)]",
        unavailable && "opacity-80",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          own ? "bg-white/20" : "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]",
        )}
      >
        <AttachmentIcon
          mime={file.mimeType}
          className={cn(
            "h-4.5 w-4.5",
            own ? "text-[var(--bubble-own-fg)]" : "text-[var(--accent-fg)]",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">
          {file.originalName}
        </span>
        <span
          className={cn(
            "block text-[0.68rem]",
            own ? "text-[var(--bubble-own-sub)]" : "text-[var(--muted)]",
          )}
        >
          {file.encrypted && unavailable
            ? "Locked — could not decrypt"
            : `${humanSize(file.size)}${file.encrypted ? " · end-to-end encrypted" : ""}`}
        </span>
      </span>
      {unavailable ? (
        <AlertTriangle
          className={cn(
            "h-4 w-4 shrink-0",
            own ? "text-[var(--bubble-own-sub)]" : "text-[var(--muted)]",
          )}
        />
      ) : (
        <a
          href={url ?? undefined}
          download={file.originalName}
          aria-disabled={!url}
          aria-label={`Download ${file.originalName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Download
            className={cn(
              "h-4 w-4 shrink-0",
              own ? "text-[var(--bubble-own-sub)]" : "text-[var(--muted)]",
            )}
          />
        </a>
      )}
    </span>
  );
}

export function InlineMedia({
  attachment,
  gallery = false,
}: {
  attachment: AttachmentDTO;
  gallery?: boolean;
}) {
  const { url, failed } = useEncryptedAttachmentUrl(attachment);
  const [loading, setLoading] = useState(true);
  const [failedRender, setFailedRender] = useState(false);
  const showFailed = failed || failedRender;

  if (showFailed) {
    return (
      <span className="flex h-40 w-full flex-col items-center justify-center gap-2 bg-black/10 text-xs text-[var(--muted)]">
        <AlertTriangle className="h-5 w-5" />
        Media unavailable
      </span>
    );
  }

  if (!url) {
    return (
      <span className="absolute inset-0 flex items-center justify-center bg-black/10">
        <Loader2 className="h-5 w-5 animate-spin text-white" />
        <span className="sr-only">Decrypting securely…</span>
      </span>
    );
  }

  return (
    <>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/10">
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        </span>
      ) : null}
      {attachment.kind === "video" ? (
        <video
          src={url}
          muted
          preload="metadata"
          onLoadedData={() => setLoading(false)}
          onError={() => setFailedRender(true)}
          className={cn(
            "w-full object-cover transition-transform duration-300 group-hover/img:scale-105",
            gallery ? "h-full" : "max-h-64",
          )}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={attachment.originalName}
          loading="lazy"
          onLoad={() => setLoading(false)}
          onError={() => setFailedRender(true)}
          className={cn(
            "w-full object-cover transition-transform duration-300 group-hover/img:scale-105",
            gallery ? "h-full" : "max-h-64",
          )}
        />
      )}
    </>
  );
}
