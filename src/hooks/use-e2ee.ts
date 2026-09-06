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
  shouldRotateKey,
  KEY_ROTATION_INTERVAL_MS,
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
          // Pick the highest keyVersion shared to us: with rotation there can
          // be several rows (active + history), and array order is unspecified.
          const candidates = (data.keys ?? [])
            .filter((k: { encryptedKey?: string }) => k.encryptedKey)
            .sort((a: { keyVersion?: number }, b: { keyVersion?: number }) => (b.keyVersion ?? 0) - (a.keyVersion ?? 0));
          for (const keyData of candidates) {
            if (!keyPairRef.current?.privateKey) break;
            try {
              return await decryptKeyFromSender(
                keyData.encryptedKey,
                keyPairRef.current.privateKey,
              );
            } catch {
              // Row encrypted for a different device/keypair — try the next one.
            }
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

  /** Try to decrypt with historical keys if current key fails */
  const decryptWithHistory = useCallback(
    async (ciphertext: string, conversationId: string): Promise<string> => {
      // First try current key
      try {
        const { key } = await getConversationKey(conversationId);
        return await decryptMessage(ciphertext, key);
      } catch {
        // Current key failed, try historical keys
      }
      
      // Fetch historical keys from server
      try {
        const res = await fetch(`/api/e2ee/key-rotation/history?conversationId=${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          const history = data.history ?? [];
          
          for (const histKey of history) {
            try {
              const key = await decryptKeyFromSender(
                histKey.encryptedKey,
                keyPairRef.current!.privateKey,
              );
              const result = await decryptMessage(ciphertext, key);
              return result;
            } catch {
              // This historical key didn't work, try next
            }
          }
        }
      } catch {}
      
      throw new Error('Could not decrypt with any available key');
    },
    [getConversationKey],
  );

  /** Decrypt a received message. Re-fetches the key from the server if the
   *  cached key fails (handles the race where the shared key arrived after
   *  the local key was generated). Also tries historical keys for messages
   *  encrypted with older keys before rotation. */
  const decrypt = useCallback(
    async (ciphertext: string, conversationId: string): Promise<string> => {
      const tryDecrypt = async (key: CryptoKey) => decryptMessage(ciphertext, key);
      const { key } = await getConversationKey(conversationId);
      try {
        return await tryDecrypt(key);
      } catch {
        // Current key failed — try historical keys from rotation.
        try {
          return await decryptWithHistory(ciphertext, conversationId);
        } catch {
          // Historical keys didn't work either — cached key might be stale.
          conversationKeysRef.current.delete(conversationId);
          await sleep(1000);
          const { key: freshKey } = await getConversationKey(conversationId);
          try {
            return await tryDecrypt(freshKey);
          } catch {
            // Final attempt: try history with fresh key
            return await decryptWithHistory(ciphertext, conversationId);
          }
        }
      }
    },
    [getConversationKey, decryptWithHistory],
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

  /* ----------------------- Key Rotation Functions ----------------------- */
  
  /** Check if a conversation key needs rotation */
  const checkRotationNeeded = useCallback(
    async (conversationId: string): Promise<{ needed: boolean; reason: string | null }> => {
      try {
        const res = await fetch(`/api/e2ee/key-rotation/status?conversationId=${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          return {
            needed: data.needsRotation ?? false,
            reason: data.reason ?? null,
          };
        }
      } catch {}
      return { needed: false, reason: null };
    },
    [],
  );

  /** Rotate the conversation key and share with all peers */
  const rotateConversationKey = useCallback(
    async (conversationId: string): Promise<boolean> => {
      try {
        // Generate new key
        const newKey = await generateConversationKey();
        conversationKeysRef.current.set(conversationId, newKey);
        
        // Share with all peers
        const peersRes = await fetch(`/api/e2ee/peers?conversationId=${conversationId}`);
        if (peersRes.ok) {
          const peersData = await peersRes.json();
          const peers = peersData.peers ?? [];
          
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
        
        // Mark rotation complete on server
        await fetch('/api/e2ee/key-rotation/rotate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId }),
        });
        
        return true;
      } catch {
        return false;
      }
    },
    [shareKey],
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

  /** Unwrap a per-file media key using cached, shared, or historical keys.
   * Receiving never replaces or generates the conversation's sending key. */
  const decryptMedia = useCallback(
    async (encryptedBytesB64: string, wrappedKeyB64: string, conversationId: string): Promise<ArrayBuffer> => {
      const unwrapMediaKey = async (conversationKey: CryptoKey): Promise<CryptoKey> => {
        const wrappedKey = await decryptBytes(wrappedKeyB64, conversationKey);
        const mediaKeyB64 = new TextDecoder().decode(wrappedKey);
        return importSymmetricKey(mediaKeyB64);
      };
      const decryptWith = async (mediaKey: CryptoKey): Promise<ArrayBuffer> =>
        decryptBytes(encryptedBytesB64, mediaKey);

      // Receiving media must never generate or replace the sending key.
      if (!keyPairRef.current) {
        console.error("[E2EE] decryptMedia: Device keys not ready (keyPairRef is null)");
        throw new Error("Device keys are not ready");
      }

      const cached = conversationKeysRef.current.get(conversationId);
      console.log(`[E2EE] decryptMedia: cached key exists: ${!!cached}, wrappedKeyB64 length: ${wrappedKeyB64?.length}`);
      if (cached) {
        try {
          return await decryptWith(await unwrapMediaKey(cached));
        } catch (e) {
          console.warn("[E2EE] decryptMedia: Cached key decryption failed, trying shared keys:", e);
        }
      }

      for (const endpoint of ["conversation-keys", "key-rotation/history"]) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const res = await fetch(`/api/e2ee/${endpoint}?conversationId=${encodeURIComponent(conversationId)}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            console.warn(`[E2EE] decryptMedia: ${endpoint} returned ${res.status}`);
            continue;
          }

          const data = await res.json();
          const keys = data.keys ?? data.history ?? [];

          if (keys.length === 0) {
            console.warn(`[E2EE] decryptMedia: No keys found at ${endpoint}`);
            continue;
          }

          console.log(`[E2EE] decryptMedia: Fetched ${keys.length} keys from ${endpoint}`);

          for (const row of keys) {
            if (!row.encryptedKey) {
              console.warn("[E2EE] decryptMedia: Skipping row with no encryptedKey");
              continue;
            }

            console.log(`[E2EE] decryptMedia: Trying key row: userId=${row.userId?.slice(0,8)}, deviceId=${row.deviceId?.slice(0,8)}, keyVersion=${row.keyVersion}, encryptedKey len=${row.encryptedKey?.length}`);

            try {
              const key = await decryptKeyFromSender(row.encryptedKey, keyPairRef.current.privateKey);
              console.log("[E2EE] decryptMedia: Successfully decrypted conversation key from row, attempting to unwrap media key");
              try {
                return await decryptWith(await unwrapMediaKey(key));
              } catch (unwrapErr) {
                console.warn("[E2EE] decryptMedia: Conversation key decrypted but failed to unwrap media key:", unwrapErr);
              }
            } catch (e) {
              console.warn("[E2EE] decryptMedia: Failed to decrypt conversation key from row:", e);
            }
          }
        } catch (e) {
          clearTimeout(timeoutId);
          console.error(`[E2EE] decryptMedia: Fetch error for ${endpoint}:`, e);
        }
      }

      console.error("[E2EE] decryptMedia: No available key could decrypt this attachment");
      throw new Error("No available key could decrypt this attachment");
    },
    [],
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
    // Key rotation
    checkRotationNeeded,
    rotateConversationKey,
  };
}
