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
  useRef,
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
}

const E2EEMediaContext = createContext<E2EEMediaContextValue | null>(null);

export function E2EEMediaProvider({
  conversationId,
  decryptMedia,
  children,
}: {
  conversationId: string;
  decryptMedia: DecryptFn;
  children: ReactNode;
}) {
  const value = useRef<E2EEMediaContextValue | null>(null);
  if (!value.current || value.current.conversationId !== conversationId) {
    value.current = { conversationId, decryptMedia };
  }
  return (
    <E2EEMediaContext.Provider value={value.current}>
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
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });

  useEffect(() => {
    if (!attachment) {
      setState({ url: null, failed: false });
      return;
    }
    if (!attachment.encrypted || !attachment.encKey) {
      setState({ url: attachment.url, failed: false });
      return;
    }
    if (!ctx) {
      setState({ url: null, failed: true });
      return;
    }

    const cached = objectUrlCache.get(attachment.id);
    if (cached) {
      setState({ url: cached, failed: false });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(attachment.url, { cache: "no-store" });
        if (!res.ok) throw new Error("fetch_failed");
        const ciphertext = await res.arrayBuffer();
        const plain = await ctx.decryptMedia(
          bufferToBase64(ciphertext),
          attachment.encKey!,
          ctx.conversationId,
        );
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(
          new Blob([plain], { type: attachment.mimeType || "application/octet-stream" }),
        );
        objectUrlCache.set(attachment.id, objectUrl);
        setState({ url: objectUrl, failed: false });
      } catch {
        if (!cancelled) setState({ url: null, failed: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachment, ctx]);

  return state;
}

/** Picks a context-provided decrypt function from any provider above. */
export function useDecryptMedia(): DecryptFn | null {
  const ctx = useE2EEMediaContext();
  return ctx?.decryptMedia ?? null;
}
