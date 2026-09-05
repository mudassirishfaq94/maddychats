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
  error: string | null;
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
    error: null,
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
      let publicKeyStr: string;

      if (stored) {
        const parsed = JSON.parse(stored);
        const privateKey = await importPrivateKey(parsed.privateKey);
        const publicKey = await importPublicKey(parsed.publicKey);
        keyPair = { privateKey, publicKey };
        publicKeyStr = parsed.publicKey;
      } else {
        keyPair = await generateKeyPair();
        const publicKey = await exportPublicKey(keyPair.publicKey);
        publicKeyStr = publicKey;
        const privateKey = await exportPrivateKey(keyPair.privateKey);

        // Store locally
        localStorage.setItem(
          `e2ee_keypair_${userId}`,
          JSON.stringify({ publicKey, privateKey }),
        );

        // Register with server
        const passphrase = deviceId; // Use deviceId as passphrase for simplicity
        const encryptedPrivateKey = await encryptPrivateKeyForStorage(privateKey, passphrase);

        const response = await fetch("/api/e2ee/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, publicKey, encryptedPrivateKey }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error("Device key registration failed");
      }

      keyPairRef.current = keyPair;

      setState({
        initialized: true,
        deviceId,
        publicKey: publicKeyStr,
        loading: false,
        error: null,
      });
    }

    init().catch(() => setState((prev) => ({
      ...prev, initialized: false, loading: false,
      error: "Encryption could not be initialized on this device. Reload to try again.",
    })));
  }, [userId]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Fetch a shared conversation key from the server (other user's share). */
  const fetchSharedKey = useCallback(
    async (conversationId: string): Promise<CryptoKey | null> => {
      try {
        const res = await fetch(`/api/e2ee/conversation-keys?conversationId=${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          const keyData = data.keys?.[0];
          if (keyData && keyPairRef.current?.privateKey) {
            return decryptKeyFromSender(
              keyData.encryptedKey,
              keyPairRef.current.privateKey,
            );
          }
        }
      } catch {}
      return null;
    },
    [],
  );

  /**
   * Get or create a symmetric key for a conversation.
   *
   * When opening a chat, the other user's browser may still be in the middle
   * of sharing its key via POST /api/e2ee/conversation-keys.  To avoid a race
   * where both sides generate different keys and can never decrypt each other,
   * we retry the server fetch a few times before falling back to a locally
   * generated key.
   *
   * Returns { key, shared } so the caller knows whether E2EE is actually
   * usable (shared=true) or just locally prepared (shared=false).
   */
  const getConversationKey = useCallback(
    async (
      conversationId: string,
      { waitForPeer = false }: { waitForPeer?: boolean } = {},
    ): Promise<{ key: CryptoKey; shared: boolean }> => {
      const cached = conversationKeysRef.current.get(conversationId);
      if (cached) return { key: cached, shared: true };

      // Try to load a shared key from the server
      let sharedKey = await fetchSharedKey(conversationId);
      if (sharedKey) {
        conversationKeysRef.current.set(conversationId, sharedKey);
        return { key: sharedKey, shared: true };
      }

      // When called from prepareConversation the other side may still be
      // mid-POST.  Wait briefly and retry before giving up.
      if (waitForPeer) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await sleep(1500);
          sharedKey = await fetchSharedKey(conversationId);
          if (sharedKey) {
            conversationKeysRef.current.set(conversationId, sharedKey);
            return { key: sharedKey, shared: true };
          }
        }
      }

      // No peer key found — generate a new local key.
      // The caller (prepareConversation) will share it with peers.
      const key = await generateConversationKey();
      conversationKeysRef.current.set(conversationId, key);
      return { key, shared: false };
    },
    [fetchSharedKey],
  );

  /** Encrypt a message before sending */
  const encrypt = useCallback(
    async (plaintext: string, conversationId: string): Promise<string> => {
      const { key } = await getConversationKey(conversationId);
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
      const { key } = await getConversationKey(conversationId);
      try {
        return await tryDecrypt(key);
      } catch {
        // Cached key might be stale — drop it and re-fetch from server.
        conversationKeysRef.current.delete(conversationId);
        await sleep(1000);
        const { key: freshKey } = await getConversationKey(conversationId);
        return tryDecrypt(freshKey);
      }
    },
    [getConversationKey],
  );

  /** Share conversation key with another user's device */
  const shareKey = useCallback(
    async (conversationId: string, targetUserId: string, targetDeviceId: string, targetPublicKeyBase64: string) => {
      const { key } = await getConversationKey(conversationId);
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
      // waitForPeer=true so we retry if the other side is mid-share
      const { key, shared } = await getConversationKey(conversationId, { waitForPeer: true });
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
      // ready is true only if (a) all peers have device keys AND (b) we
      // actually received a shared key from a peer (not just generated one
      // locally).  When only one side has opened the chat, they'll generate
      // a key and share it — the next open on the other side will pick it up.
      return { ready: ready && shared, fingerprint };
    },
    [getConversationKey, shareKey],
  );

  /** Encrypt arbitrary bytes (media) with the conversation key. */
  const encryptBytesForConversation = useCallback(
    async (plaintext: ArrayBuffer, conversationId: string): Promise<string> => {
      const { key } = await getConversationKey(conversationId);
      return encryptBytes(plaintext, key);
    },
    [getConversationKey],
  );

  /** Decrypt arbitrary bytes (media) with the conversation key. */
  const decryptBytesForConversation = useCallback(
    async (ciphertextB64: string, conversationId: string): Promise<ArrayBuffer> => {
      const tryDecrypt = (key: CryptoKey) => decryptBytes(ciphertextB64, key);
      const { key } = await getConversationKey(conversationId);
      try {
        return await tryDecrypt(key);
      } catch {
        conversationKeysRef.current.delete(conversationId);
        await sleep(1000);
        const { key: freshKey } = await getConversationKey(conversationId);
        return tryDecrypt(freshKey);
      }
    },
    [getConversationKey],
  );

  /** Unwrap a per-file media key (wrapped by the conversation key) and decrypt. */
  const decryptMedia = useCallback(
    async (encryptedBytesB64: string, wrappedKeyB64: string, conversationId: string): Promise<ArrayBuffer> => {
      const { key: conversationKey } = await getConversationKey(conversationId);
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
