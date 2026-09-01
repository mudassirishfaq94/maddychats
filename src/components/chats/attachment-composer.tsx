"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import type { MessageDTO } from "@/lib/types";
import { humanSize } from "./attachments";
import { cn } from "@/lib/utils";

export interface PendingFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

/**
 * File picker + preview strip + REAL upload progress.
 *
 * Progress comes from XMLHttpRequest's `upload.onprogress` (fetch cannot
 * report request progress), so the bar reflects actual bytes on the wire —
 * nothing is simulated. The request is abortable before completion.
 */
export function useAttachmentUpload() {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    return () => {
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 5 - pending.length);
    setPending((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      })),
    ]);
  }

  function removeFile(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clear() {
    pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    setPending([]);
    setProgress(null);
  }

  /** Cancels an in-flight upload. */
  function cancel() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setProgress(null);
  }

  function upload(
    conversationId: string,
    text: string,
    replyToMessageId: string | null,
  ): Promise<{ ok: true; message: MessageDTO } | { ok: false; error: string }> {
    return new Promise((resolve) => {
      if (pending.length === 0) {
        resolve({ ok: false, error: "No files selected." });
        return;
      }
      const form = new FormData();
      form.append("conversationId", conversationId);
      if (text) form.append("text", text);
      if (replyToMessageId) form.append("replyToMessageId", replyToMessageId);
      pending.forEach((p) => form.append("files", p.file, p.file.name));

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/upload/message");
      xhr.responseType = "json";

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        xhrRef.current = null;
        setProgress(null);
        const body = xhr.response as
          | { message?: MessageDTO; error?: string }
          | null;
        if (xhr.status >= 200 && xhr.status < 300 && body?.message) {
          clear();
          resolve({ ok: true, message: body.message });
        } else {
          resolve({
            ok: false,
            error: body?.error ?? `Upload failed (${xhr.status}).`,
          });
        }
      };
      xhr.onerror = () => {
        xhrRef.current = null;
        setProgress(null);
        resolve({ ok: false, error: "Network error during upload." });
      };
      xhr.onabort = () => {
        xhrRef.current = null;
        setProgress(null);
        resolve({ ok: false, error: "Upload cancelled." });
      };

      setProgress(0);
      xhr.send(form);
    });
  }

  return { pending, addFiles, removeFile, clear, cancel, upload, progress };
}

/** Preview strip shown above the composer while files are staged. */
export function AttachmentPreviews({
  pending,
  progress,
  onRemove,
  onCancel,
}: {
  pending: PendingFile[];
  progress: number | null;
  onRemove: (id: string) => void;
  onCancel: () => void;
}) {
  if (pending.length === 0) return null;
  const uploading = progress !== null;

  return (
    <div className="mb-2 rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-2.5">
      <div className="flex flex-wrap gap-2">
        {pending.map((p) => (
          <div
            key={p.id}
            className="group relative flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 pr-2.5"
          >
            {p.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.previewUrl}
                alt={p.file.name}
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]">
                <Paperclip className="h-4 w-4 text-[var(--accent)]" />
              </span>
            )}
            <span className="min-w-0 max-w-[9rem]">
              <span className="block truncate text-xs font-medium">
                {p.file.name}
              </span>
              <span className="block text-[0.65rem] text-[var(--muted)]">
                {humanSize(p.file.size)}
              </span>
            </span>
            {!uploading ? (
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.file.name}`}
                className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--card-2)] text-[var(--muted)] transition-colors hover:text-[var(--danger)]"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {uploading ? (
        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full transition-[width] duration-150"
              style={{
                width: `${progress}%`,
                background: "var(--accent)",
              }}
            />
          </div>
          <span className="flex items-center gap-1.5 text-xs tabular-nums text-[var(--muted)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            {progress}%
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-[var(--danger)] hover:opacity-80"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Paperclip trigger + hidden multi-file input (works on mobile). */
export function AttachButton({
  onFiles,
  disabled,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        // Mobile browsers show camera/photo/file options for these types.
        accept="image/*,.pdf,.txt,.md,.csv,.json,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,audio/*,video/mp4"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label="Attach files"
        title="Attach files"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--muted)] transition-colors",
          "hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-50",
        )}
      >
        <Paperclip className="h-4.5 w-4.5" />
      </button>
    </>
  );
}
