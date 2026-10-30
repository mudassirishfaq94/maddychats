"use client";

/**
 * E2EE media plumbing.
 *
 * Attachments sent while a conversation is E2EE-active are stored as opaque
 * AES-GCM ciphertext. This context gives every media consumer (inline images,
 * lightbox, file chips, voice players) a way to download + decrypt an
 * attachment into a usable object URL — all inside the browser, so the
 * server never sees plaintext bytes.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createMediaResourceCache } from "@/lib/media-resource-cache";
import type { AttachmentDTO } from "@/lib/types";
import { isActiveContentType, normalizeMediaType } from "@/lib/media-types";
import {useExpiredAt} from "@/hooks/use-expired-at";
import { registerLocalAudio, forgetLocalAudio } from "@/lib/audio-analysis";

type DecryptFn = (
  encryptedBytesB64: string | ArrayBuffer,
  wrappedKeyB64: string,
  conversationId: string,
) => Promise<ArrayBuffer>;

interface E2EEMediaContextValue {
  conversationId: string;
  decryptMedia: DecryptFn;
  initialized: boolean;
  initializationError: string | null;
}

const E2EEMediaContext = createContext<E2EEMediaContextValue | null>(null);

export function E2EEMediaProvider({
  conversationId,
  decryptMedia,
  initialized,
  initializationError,
  children,
}: {
  conversationId: string;
  decryptMedia: DecryptFn;
  initialized: boolean;
  initializationError: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ conversationId, decryptMedia, initialized, initializationError }),
    [conversationId, decryptMedia, initialized, initializationError],
  );
  return (
    <E2EEMediaContext.Provider value={value}>
      {children}
    </E2EEMediaContext.Provider>
  );
}

function useE2EEMediaContext(): E2EEMediaContextValue | null {
  return useContext(E2EEMediaContext);
}

class PermanentMediaError extends Error {}

const mediaCache = createMediaResourceCache({
  create: blob => {
    const url = URL.createObjectURL(blob);
    if (blob.type.startsWith("audio/")) registerLocalAudio(url, blob);
    return url;
  },
  revoke: url => { URL.revokeObjectURL(url); forgetLocalAudio(url); },
});
export function clearAttachmentMediaCache() { mediaCache.clear(); }
export function forgetDecryptedAttachments(ids: string[]) { mediaCache.forget(ids); }

/**
 * Resolves an attachment to a renderable URL. Plaintext attachments pass
 * straight through to the authenticated media endpoint; encrypted ones are
 * fetched as a blob, decrypted with the conversation key, and served from an
 * object URL. Returns null while decrypting / on failure.
 */
export function useEncryptedAttachmentUrl(
  attachment?: AttachmentDTO | null,
  enabled = true,
): { url: string | null; failed: boolean } {
  const ctx = useE2EEMediaContext();
  const { user } = useAuth();
  const userId = user?.id;
  const { id, url, encrypted, encKey, expiresAt } = attachment ?? {};
  const mimeType = normalizeMediaType(attachment?.originalName ?? "", attachment?.mimeType ?? "");
  const activeContent = isActiveContentType(mimeType ?? "");
  const expired=useExpiredAt(expiresAt);
  useEffect(()=>{if(expired && id)forgetDecryptedAttachments([id]);},[expired,id]);
  const request = useMemo(
    () => ({ id, url, encrypted, encKey, mimeType, ctx, expired, enabled, userId, activeContent }),
    [id, url, encrypted, encKey, mimeType, ctx, expired, enabled, userId, activeContent],
  );
  const [state, setState] = useState<{
    request: typeof request | null; url: string | null; failed: boolean;
  }>({ request: null, url: null, failed: false });

  useEffect(() => {
    const { id, url, encrypted, encKey, mimeType, ctx, expired, enabled, userId, activeContent } = request;
    if (activeContent) return;
    if (!id || !url || !encrypted || !encKey || expired || !enabled || !userId ||
        !ctx?.initialized || ctx.initializationError) return;
    let active = true;
    const key = JSON.stringify([userId, ctx.conversationId, id, url, encKey, mimeType]);
    const resource = mediaCache.acquire(key, id, async cancel => {
      const signal = AbortSignal.any([cancel, AbortSignal.timeout(mimeType?.startsWith("video/") ? 900000 : 180000)]);
      let ciphertext: ArrayBuffer | undefined;
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        try {
          if (!ciphertext) {
            const response = await fetch(url, { cache: "no-store", signal });
            if (!response.ok) {
              if (response.status < 500 && response.status !== 429) throw new PermanentMediaError();
              throw new Error("Media download failed");
            }
            ciphertext = await response.arrayBuffer();
            if (ciphertext.byteLength < 28) throw new PermanentMediaError();
          }
          const plain = await ctx.decryptMedia(ciphertext, encKey, ctx.conversationId);
          signal.throwIfAborted();
          if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new PermanentMediaError();
          return new Blob([plain], { type: mimeType || "application/octet-stream" });
        } catch (cause) {
          if (signal.aborted || cause instanceof PermanentMediaError || attempt >= 2) throw cause;
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(signal.reason); };
            const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1500);
            signal.addEventListener("abort", abort, { once: true });
          });
        }
      }
    });
    void resource.promise.then(value => {
      if (!active) return;
      setState({ request, url: value, failed: false });
    }).catch(() => { if (active) setState({ request, url: null, failed: true }); });
    return () => { active = false; resource.release(); };
  }, [request, expiresAt]);

  if (!id) return { url: null, failed: false };
  if (activeContent) return { url: null, failed: true };
  if (expired) return { url: null, failed: true };
  if (!encrypted) return { url: url ?? null, failed: false };
  if (!ctx || !encKey || ctx.initializationError) return { url: null, failed: true };
  if (!ctx.initialized || !enabled) return { url: null, failed: false };
  return state.request === request ? state : { url: null, failed: false };
}

/** Picks a context-provided decrypt function from any provider above. */
export function useDecryptMedia(): DecryptFn | null {
  const ctx = useE2EEMediaContext();
  return ctx?.decryptMedia ?? null;
}
