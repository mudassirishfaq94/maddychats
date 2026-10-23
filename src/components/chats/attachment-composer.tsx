"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import type { MessageDTO } from "@/lib/types";
export { AttachmentReview as AttachmentPreviews } from "./attachment-review";
import { cn } from "@/lib/utils";
import { MEDIA_MAX_BYTES, INLINE_MEDIA_MAX_BYTES } from "@/lib/media-limits";
import { normalizeMediaType } from "@/lib/media-types";
import { stageEncryptedFile } from "@/lib/staged-upload";

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
  const operation = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingFile[]>([]);
  const [phase, setPhase] = useState<"encrypting" | "uploading" | "finishing" | null>(null);

  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
      operation.current?.abort();
      xhrRef.current?.abort();
    };
  }, []);

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 5 - pendingRef.current.length).map(original => {
      const mime=normalizeMediaType(original.name,original.type);
      const file=mime===original.type?original:new File([original],original.name,{type:mime,lastModified:original.lastModified});
      const previewUrl = /^(image|video|audio)\//.test(file.type) ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrls.current.add(previewUrl);
      return { id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, previewUrl };
    });
    pendingRef.current = [...pendingRef.current, ...list];
    setPending(pendingRef.current);
  }

  function removeFile(id: string) {
    const target = pendingRef.current.find(p => p.id === id);
    if (target?.previewUrl) { URL.revokeObjectURL(target.previewUrl); previewUrls.current.delete(target.previewUrl); }
    pendingRef.current = pendingRef.current.filter(p => p.id !== id);
    setPending(pendingRef.current);
  }

  function clear() {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
    pendingRef.current = [];
    setPending([]);
    setProgress(null);
    setPhase(null);
  }

  /** Cancels an in-flight upload. */
  function cancel() {
    operation.current?.abort();
    xhrRef.current?.abort();
    xhrRef.current = null;
    setProgress(null);
    setPhase(null);
  }

  function begin() {
    operation.current?.abort();
    operation.current = new AbortController();
    setPhase("encrypting");
    return operation.current.signal;
  }
  function finish() { setPhase(null); setProgress(null); }

  function upload(
    conversationId: string,
    text: string,
    replyToMessageId: string | null,
    encryptFile?: (file: File) => Promise<{
      file: File;
      wrappedKey: string;
      originalMime: string;
    }>,
    encryptText?: (plain: string) => Promise<string>,
    signal: AbortSignal = begin(),
    files: PendingFile[] = pendingRef.current,
  ): Promise<{ ok: true; message: MessageDTO } | { ok: false; error: string }> {
    return new Promise((resolve) => {
      const selected = [...files];
      if (selected.length === 0) {
        finish();
        resolve({ ok: false, error: "No files selected." });
        return;
      }
      if (selected.reduce((total, item) => total + item.file.size, 0) > MEDIA_MAX_BYTES) {
        finish();
        resolve({ ok: false, error: "These files are too large (250 MB max). Send them in smaller groups." });
        return;
      }
      (async () => {
        try {
      signal.throwIfAborted();
      const form = new FormData();
      const totalBytes=selected.reduce((total,item)=>total+item.file.size,0);
      const usingStaging=totalBytes>INLINE_MEDIA_MAX_BYTES;
      const staged:string[]=[];let transferred=0;
      form.append("conversationId", conversationId);
      if (replyToMessageId) form.append("replyToMessageId", replyToMessageId);

      if (encryptFile) {
        // E2EE mode: every file is encrypted client-side before upload; the
        // server stores only ciphertext plus a conversation-wrapped key.
        form.append("encrypted", "true");
        for (const p of selected) {
          const out = await encryptFile(p.file);
          signal.throwIfAborted();
          if(usingStaging) {
            setPhase("uploading");
            staged.push(await stageEncryptedFile(out.file,conversationId,out.originalMime,signal,loaded=>setProgress(Math.min(99,Math.round((transferred+loaded)/Math.max(1,totalBytes)*100)))));
            transferred+=out.file.size;
          } else form.append("files", out.file, p.file.name);
          form.append("keys", out.wrappedKey);
          form.append("origTypes", out.originalMime);
        }
        if(usingStaging)form.append("staged",JSON.stringify(staged));
        if (text) {
          if (!encryptText) throw new Error("Couldn't prepare the caption.");
          const encryptedCaption = await encryptText(text);
          form.append("text", encryptedCaption);
        }
      } else {
        if (text) form.append("text", text);
        selected.forEach((p) => form.append("files", p.file, p.file.name));
      }

      signal.throwIfAborted();
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/upload/message");
      xhr.responseType = "json";
      xhr.timeout = 180000;
      const abort = () => xhr.abort();
      signal.addEventListener("abort", abort, { once: true });
      xhr.onloadend = () => signal.removeEventListener("abort", abort);

      xhr.upload.onprogress = (e) => {
        if(usingStaging)return;
        if (e.lengthComputable && e.total > 0) {
          setProgress(Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100))));
          if (e.loaded >= e.total) setPhase("finishing");
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
      xhr.ontimeout = () => { xhrRef.current = null; finish(); resolve({ ok: false, error: "The upload timed out. Your files and caption are still here. Check this chat before retrying." }); };
      xhr.onerror = () => {
        xhrRef.current = null;
        setProgress(null);
        resolve({ ok: false, error: "No connection during upload." });
      };
      xhr.onabort = () => {
        xhrRef.current = null;
        setProgress(null);
        resolve({ ok: false, error: "Upload cancelled." });
      };

      setPhase(usingStaging?"finishing":"uploading");
      setProgress(usingStaging?100:0);
      xhr.send(form);
        } catch {
          xhrRef.current = null;
          setProgress(null);
          resolve({ ok: false, error: signal.aborted ? "Upload cancelled." : "Couldn't prepare the file." });
        }
      })();
    });
  }

  return { pending, addFiles, removeFile, clear, cancel, begin, finish, upload, progress, phase };
}

/** Paperclip trigger + hidden multi-file input (works on mobile). */
export function AttachButton({
  onFiles,
  disabled,
  compact = false,
  inputId,
  hideTrigger = false,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  compact?: boolean;
  inputId?: string;
  hideTrigger?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        // Mobile browsers show camera/photo/file options for these types.
        accept="image/*,video/*,audio/*,.heic,.heif,.avif,.jpg,.jpeg,.pdf,.txt,.md,.csv,.json,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {!hideTrigger ? <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label="Attach files"
        title="Attach files"
        className={cn(
          "composer-icon flex h-11 w-11 flex-none items-center justify-center text-[var(--muted)] transition-colors",
          compact ? "rounded-full" : "rounded-2xl border border-[var(--border)]",
          "hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-50",
        )}
      >
        <Paperclip className="h-4.5 w-4.5" />
        <span className="sr-only">Attach</span>
      </button> : null}
    </>
  );
}
