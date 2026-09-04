"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import type { AttachmentDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEncryptedAttachmentUrl } from "./e2ee-context";

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  if (mime.includes("pdf")) return FileText;
  if (mime.includes("zip")) return FileArchive;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return FileSpreadsheet;
  if (mime.startsWith("text/")) return FileText;
  return FileIcon;
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
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
  }, [activeSrc]);

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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, goNext, goPrev]);

  const hasNav = images && images.length > 1 && currentIndex !== undefined;
  const downloadHref = current?.encrypted ? (resolved.url ?? undefined) : src;
  const isDecrypting = Boolean(current?.encrypted && !resolved.url && !resolved.failed);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-6 backdrop-blur-sm"
    >
      {/* Top controls */}
      <div className="absolute right-4 top-4 flex gap-2 z-10">
        <a
          href={downloadHref}
          download={alt}
          aria-disabled={!downloadHref}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Download image"
        >
          <Download className="h-4.5 w-4.5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Counter */}
      {hasNav ? (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm font-medium text-white/70 z-10">
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

      {isDecrypting ? (
        <div className="flex flex-col items-center gap-3 text-white/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Decrypting securely…</p>
        </div>
      ) : null}
      {!isDecrypting && loading && !failed ? (
        <Loader2 className="h-8 w-8 animate-spin text-white/70" />
      ) : null}
      {!isDecrypting && failed ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-white/75">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm">This media could not be loaded.</p>
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
            onLoadedData={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            className={cn(
              "max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl",
              loading && "invisible absolute",
            )}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={activeSrc}
            src={activeSrc}
            alt={alt}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            className={cn(
              "max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl animate-fade-in",
              loading && "invisible absolute",
            )}
          />
        )
      ) : null}
    </div>
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
  const Icon = iconFor(file.mimeType);
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
        <Icon
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
