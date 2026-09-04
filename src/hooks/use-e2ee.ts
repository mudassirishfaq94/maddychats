"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateDeviceId,
  generateKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  generateConversationKey,
  exportSymmetricKey,
  importSymmetricKey,
  encryptKeyForUser,
  decryptKeyFromSender,
  encryptMessage,
  decryptMessage,
  encryptBytes,
  decryptBytes,
  conversationFingerprint,
  encryptPrivateKeyForStorage,
  decryptPrivateKeyFromStorage,
} from "@/lib/crypto";

interface PeerDevice {
  deviceId: string;
  publicKey: string;
}

interface Peer {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  devices: PeerDevice[];
}

interface E2EEState {
  initialized: boolean;
  deviceId: string;
  publicKey: string | null;
  loading: boolean;
}

/**
 * E2EE hook — manages key generation, registration, and message encryption.
 */
export function useE2EE(userId: string | undefined) {
  const [state, setState] = useState<E2EEState>({
    initialized: false,
    deviceId: "",
    publicKey: null,
    loading: true,
  });

  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const conversationKeysRef = useRef<Map<string, CryptoKey>>(new Map());

  // Initialize on mount
  useEffect(() => {
    if (!userId) return;

    async function init() {
      const deviceId = generateDeviceId();
      const stored = localStorage.getItem(`e2ee_keypair_${userId}`);

      let keyPair: CryptoKeyPair;

      if (stored) {
        const parsed = JSON.parse(stored);
        const privateKey = await importPrivateKey(parsed.privateKey);
        const publicKey = await importPublicKey(parsed.publicKey);
        keyPair = { privateKey, publicKey };
      } else {
        keyPair = await generateKeyPair();
        const publicKey = await exportPublicKey(keyPair.publicKey);
        const privateKey = await exportPrivateKey(keyPair.privateKey);

        // Store locally
        localStorage.setItem(
          `e2ee_keypair_${userId}`,
          JSON.stringify({ publicKey, privateKey }),
        );

        // Register with server
        const passphrase = deviceId; // Use deviceId as passphrase for simplicity
        const encryptedPrivateKey = await encryptPrivateKeyForStorage(privateKey, passphrase);

        await fetch("/api/e2ee/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, publicKey, encryptedPrivateKey }),
        });
      }

      keyPairRef.current = keyPair;
      const publicKeyStr = await exportPublicKey(keyPair.publicKey);

      setState({
        initialized: true,
        deviceId,
        publicKey: publicKeyStr,
        loading: false,
      });
    }

    init().catch(() => setState((prev) => ({ ...prev, loading: false })));
  }, [userId]);

  /** Get or create a symmetric key for a conversation */
  const getConversationKey = useCallback(
    async (conversationId: string): Promise<CryptoKey> => {
      const cached = conversationKeysRef.current.get(conversationId);
      if (cached) return cached;

      // Try to load from server
      try {
        const res = await fetch(`/api/e2ee/conversation-keys?conversationId=${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          const keyData = data.keys?.[0];
          if (keyData && keyPairRef.current?.privateKey) {
            const key = await decryptKeyFromSender(
              keyData.encryptedKey,
              keyPairRef.current.privateKey,
            );
            conversationKeysRef.current.set(conversationId, key);
            return key;
          }
        }
      } catch {}

      // Generate new conversation key
      const key = await generateConversationKey();
      conversationKeysRef.current.set(conversationId, key);
      return key;
    },
    [],
  );

  /** Encrypt a message before sending */
  const encrypt = useCallback(
    async (plaintext: string, conversationId: string): Promise<string> => {
      const key = await getConversationKey(conversationId);
      return encryptMessage(plaintext, key);
    },
    [getConversationKey],
  );

  /** Decrypt a received message. Re-fetches the key from the server if the
   *  cached key fails (handles the race where the shared key arrived after
   *  the local key was generated). */
  const decrypt = useCallback(
    async (ciphertext: string, conversationId: string): Promise<string> => {
      const tryDecrypt = async (key: CryptoKey) => decryptMessage(ciphertext, key);
      const key = await getConversationKey(conversationId);
      try {
        return await tryDecrypt(key);
      } catch {
        // Cached key might be stale — drop it and re-fetch from server.
        conversationKeysRef.current.delete(conversationId);
        const freshKey = await getConversationKey(conversationId);
        return tryDecrypt(freshKey);
      }
    },
    [getConversationKey],
  );

  /** Share conversation key with another user's device */
  const shareKey = useCallback(
    async (conversationId: string, targetUserId: string, targetDeviceId: string, targetPublicKeyBase64: string) => {
      const key = await getConversationKey(conversationId);
      const targetPublicKey = await importPublicKey(targetPublicKeyBase64);
      const encryptedKey = await encryptKeyForUser(key, targetPublicKey);

      const res = await fetch("/api/e2ee/conversation-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          targetUserId,
          encryptedKey,
          deviceId: state.deviceId,
        }),
      });
      return res.ok;
    },
    [getConversationKey, state.deviceId],
  );

  /**
   * Prepare a conversation for E2EE: fetch-or-create its symmetric key, share
   * it to every device of every peer, and return the verification fingerprint.
   *
   * ready=false means at least one peer has no registered device key yet, so
   * the caller should send plaintext this session (messages only become E2EE
   * once every participant has keys — the UI says so honestly).
   */
  const prepareConversation = useCallback(
    async (conversationId: string): Promise<{ ready: boolean; fingerprint: string | null }> => {
      const key = await getConversationKey(conversationId);
      let peers: Peer[] = [];
      try {
        const res = await fetch(`/api/e2ee/peers?conversationId=${encodeURIComponent(conversationId)}`);
        if (res.ok) {
          const data = (await res.json()) as { peers?: Peer[] };
          peers = data.peers ?? [];
        }
      } catch {
        peers = [];
      }

      // No peers (self chat, fresh group with only you) → encryption works.
      const ready = peers.every((p) => p.devices.length > 0);
      if (ready) {
        for (const peer of peers) {
          for (const device of peer.devices) {
            try {
              await shareKey(conversationId, peer.userId, device.deviceId, device.publicKey);
            } catch {
              // best-effort per device
            }
          }
        }
      }

      let fingerprint: string | null = null;
      try {
        fingerprint = await conversationFingerprint(key);
      } catch {
        fingerprint = null;
      }
      return { ready, fingerprint };
    },
    [getConversationKey, shareKey],
  );

  /** Encrypt arbitrary bytes (media) with the conversation key. */
  const encryptBytesForConversation = useCallback(
    async (data: ArrayBuffer | Uint8Array, conversationId: string): Promise<string> => {
      const key = await getConversationKey(conversationId);
      return encryptBytes(data, key);
    },
    [getConversationKey],
  );

  /** Decrypt media bytes produced by encryptBytesForConversation. */
  const decryptBytesForConversation = useCallback(
    async (ciphertextBase64: string, conversationId: string): Promise<ArrayBuffer> => {
      const key = await getConversationKey(conversationId);
      return decryptBytes(ciphertextBase64, key);
    },
    [getConversationKey],
  );

  /** Unwrap a per-file media key (wrapped by the conversation key) and decrypt. */
  const decryptMedia = useCallback(
    async (encryptedBytesB64: string, wrappedKeyB64: string, conversationId: string): Promise<ArrayBuffer> => {
      const conversationKey = await getConversationKey(conversationId);
      // The wrapper holds the utf8 text of the media key's base64, so decode
      // it back to text before importing (never re-encode it).
      const wrappedKey = await decryptBytes(wrappedKeyB64, conversationKey);
      const mediaKeyB64 = new TextDecoder().decode(wrappedKey);
      const mediaKey = await importSymmetricKey(mediaKeyB64);
      return decryptBytes(encryptedBytesB64, mediaKey);
    },
    [getConversationKey],
  );

  return {
    ...state,
    encrypt,
    decrypt,
    shareKey,
    getConversationKey,
    prepareConversation,
    encryptBytesForConversation,
    decryptBytesForConversation,
    decryptMedia,
  };
}
