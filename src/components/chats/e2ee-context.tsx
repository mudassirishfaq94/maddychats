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
import type { AttachmentDTO } from "@/lib/types";

type DecryptFn = (
  encryptedBytesB64: string,
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

/* Module-level cache of decrypted object URLs (one per attachment). */
const objectUrlCache = new Map<string, string>();

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Resolves an attachment to a renderable URL. Plaintext attachments pass
 * straight through to the authenticated media endpoint; encrypted ones are
 * fetched as a blob, decrypted with the conversation key, and served from an
 * object URL. Returns null while decrypting / on failure.
 */
export function useEncryptedAttachmentUrl(
  attachment?: AttachmentDTO | null,
): { url: string | null; failed: boolean } {
  const ctx = useE2EEMediaContext();
  const { id, url, encrypted, encKey, mimeType } = attachment ?? {};
  const request = useMemo(
    () => ({ id, url, encrypted, encKey, mimeType, ctx }),
    [id, url, encrypted, encKey, mimeType, ctx],
  );
  const [state, setState] = useState<{
    request: typeof request | null; url: string | null; failed: boolean;
  }>({ request: null, url: null, failed: false });

  useEffect(() => {
    const { id, url, encrypted, encKey, mimeType, ctx } = request;

    if (!id || !url || !encrypted || !encKey) {
      return;
    }

    if (!ctx) {
      console.error("[E2EE] No E2EE context - E2EE provider may not be mounted");
      setState({ request, url: null, failed: true });
      return;
    }

    if (ctx.initializationError) {
      console.error("[E2EE] Context initialization error:", ctx.initializationError);
      setState({ request, url: null, failed: true });
      return;
    }

    if (!ctx.initialized) {
      return;
    }

    if (objectUrlCache.has(id)) {
      return;
    }

    const attachment = { id, url, encKey, mimeType };
    let cancelled = false;
    const controller = new AbortController();

    const timeoutId = typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), 15000)
      : null;

    (async () => {
      try {
        let plain: ArrayBuffer | undefined;
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < 3; attempt++) {
          if (cancelled) return;

          try {
            const res = await fetch(attachment.url, {
              cache: "no-store",
              signal: controller.signal,
            });

            if (!res.ok) {
              throw new Error(`fetch_failed: ${res.status} ${res.statusText}`);
            }

            const ciphertext = await res.arrayBuffer();
            plain = await ctx.decryptMedia(
              bufferToBase64(ciphertext), attachment.encKey!, ctx.conversationId,
            );
            break;
          } catch (error) {
            lastError = error as Error;
            if (cancelled) return;

            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }
        }

        if (cancelled) return;

        if (!plain) {
          console.error("[E2EE] Decryption failed: no plaintext result after retries", lastError);
          setState({ request, url: null, failed: true });
          return;
        }

        const objectUrl = URL.createObjectURL(
          new Blob([plain], { type: attachment.mimeType || "application/octet-stream" }),
        );
        objectUrlCache.set(attachment.id, objectUrl);
        setState({ request, url: objectUrl, failed: false });
      } catch (error) {
        console.error("[E2EE] Decryption error:", error);
        if (!cancelled) setState({ request, url: null, failed: true });
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [request]);

  if (!id) return { url: null, failed: false };
  if (!encrypted) return { url: url ?? null, failed: false };
  if (!ctx || !encKey || ctx.initializationError) return { url: null, failed: true };
  if (!ctx.initialized) return { url: null, failed: true };
  const cached = objectUrlCache.get(id);
  if (cached) return { url: cached, failed: false };
  return state.request === request ? state : { url: null, failed: true };
}

/** Picks a context-provided decrypt function from any provider above. */
export function useDecryptMedia(): DecryptFn | null {
  const ctx = useE2EEMediaContext();
  return ctx?.decryptMedia ?? null;
}
