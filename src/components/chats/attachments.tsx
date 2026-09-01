"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  X,
  ZoomIn,
} from "lucide-react";
import type { AttachmentDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

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

/** Full-screen image viewer. */
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <a
          href={src}
          download={alt}
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
      />
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

  const images = attachments.filter((a) => a.kind === "image");
  const files = attachments.filter((a) => a.kind !== "image");

  return (
    <div className="space-y-2">
      {images.length > 0 ? (
        <div
          className={cn(
            "grid gap-1.5",
            images.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightbox(img)}
              className="group/img relative overflow-hidden rounded-xl"
              aria-label={`View ${img.originalName}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.originalName}
                loading="lazy"
                className="max-h-64 w-full object-cover transition-transform duration-300 group-hover/img:scale-105"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover/img:bg-black/25 group-hover/img:opacity-100">
                <ZoomIn className="h-6 w-6 text-white" />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {files.map((f) => {
        const Icon = iconFor(f.mimeType);
        return (
          <a
            key={f.id}
            href={f.url}
            download={f.originalName}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              own
                ? "border-[color-mix(in_srgb,var(--bubble-own-fg)_20%,transparent)] bg-[color-mix(in_srgb,var(--bubble-own-fg)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--bubble-own-fg)_14%,transparent)]"
                : "border-[var(--border)] bg-[var(--card-2)] hover:border-[var(--border-strong)]",
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
                {f.originalName}
              </span>
              <span
                className={cn(
                  "block text-[0.68rem]",
                  own ? "text-[var(--bubble-own-sub)]" : "text-[var(--muted)]",
                )}
              >
                {humanSize(f.size)}
              </span>
            </span>
            <Download
              className={cn(
                "h-4 w-4 shrink-0",
                own ? "text-[var(--bubble-own-sub)]" : "text-[var(--muted)]",
              )}
            />
          </a>
        );
      })}

      {lightbox ? (
        <Lightbox
          src={lightbox.url}
          alt={lightbox.originalName}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
