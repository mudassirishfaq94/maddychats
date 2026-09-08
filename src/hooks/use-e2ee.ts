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

  const decryptionKeysRef = useRef<Map<string, CryptoKey[]>>(new Map());

  // Initialize on mount
  useEffect(() => {
    if (!userId) return;

    async function init() {
      const deviceId = generateDeviceId();
      const stored = localStorage.getItem(`e2ee_keypair_${userId}`);

      let keyPair: CryptoKeyPair;
      let publicKeyStr: string;
      let privateKeyStr: string;

      // Fetch the owner's device backup before trusting browser storage. The
      // device id is intentionally browser-wide, while the keypair is scoped
      // to an account. Without this recovery step, changing from Google to
      // password sign-in could overwrite the original keypair and strand the
      // messages encrypted for it.
      const backupResponse = await fetch("/api/e2ee/keys", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!backupResponse.ok) throw new Error("Device key lookup failed");
      const backupData = await backupResponse.json() as {
        keys?: Array<{ deviceId: string; publicKey: string; encryptedPrivateKey?: string }>;
      };
      const serverDevice = backupData.keys?.find((key) => key.deviceId === deviceId);

      if (stored) {
        const parsed = JSON.parse(stored);
        // A matching server key confirms this browser copy is the correct
        // keypair. If it differs, restore the server backup instead of
        // registering the stale local key over the recoverable one.
        if (!serverDevice || serverDevice.publicKey === parsed.publicKey) {
          const privateKey = await importPrivateKey(parsed.privateKey);
          const publicKey = await importPublicKey(parsed.publicKey);
          keyPair = { privateKey, publicKey };
          publicKeyStr = parsed.publicKey;
          privateKeyStr = parsed.privateKey;
        } else if (serverDevice.encryptedPrivateKey) {
          privateKeyStr = await decryptPrivateKeyFromStorage(serverDevice.encryptedPrivateKey, deviceId);
          const privateKey = await importPrivateKey(privateKeyStr);
          const publicKey = await importPublicKey(serverDevice.publicKey);
          keyPair = { privateKey, publicKey };
          publicKeyStr = serverDevice.publicKey;
          localStorage.setItem(`e2ee_keypair_${userId}`, JSON.stringify({ publicKey: publicKeyStr, privateKey: privateKeyStr }));
        } else {
          throw new Error("Encryption key recovery is unavailable");
        }
      } else if (serverDevice?.encryptedPrivateKey) {
        privateKeyStr = await decryptPrivateKeyFromStorage(serverDevice.encryptedPrivateKey, deviceId);
        const privateKey = await importPrivateKey(privateKeyStr);
        const publicKey = await importPublicKey(serverDevice.publicKey);
        keyPair = { privateKey, publicKey };
        publicKeyStr = serverDevice.publicKey;
        localStorage.setItem(`e2ee_keypair_${userId}`, JSON.stringify({ publicKey: publicKeyStr, privateKey: privateKeyStr }));
      } else {
        keyPair = await generateKeyPair();
        const publicKey = await exportPublicKey(keyPair.publicKey);
        publicKeyStr = publicKey;
        const privateKey = await exportPrivateKey(keyPair.privateKey);
        privateKeyStr = privateKey;

        // Store locally
        localStorage.setItem(
          `e2ee_keypair_${userId}`,
          JSON.stringify({ publicKey, privateKey }),
        );
      }

      // Register on every startup. This makes a restored session recover when
      // the server-side device record was removed or an earlier request failed.
      const encryptedPrivateKey = await encryptPrivateKeyForStorage(privateKeyStr, deviceId);
      const response = await fetch("/api/e2ee/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, publicKey: publicKeyStr, encryptedPrivateKey }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Device key registration failed");

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
        const res = await fetch(`/api/e2ee/conversation-keys?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
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
    [state.deviceId],
  );

  // Preserve our own sending keys across app/browser restarts. These backups
  // are wrapped to this device's RSA key; localStorage never receives raw keys.
  const rememberSendingKey = useCallback(async (conversationId: string, key: CryptoKey) => {
    if (!userId || !keyPairRef.current) throw new Error("Device keys are not ready");
    const storageKey = `e2ee_sentkeys_${userId}_${conversationId}`;
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Array<{ fingerprint: string; wrapped: string }>;
    const fingerprint = await conversationFingerprint(key);
    if (saved.some(entry => entry.fingerprint === fingerprint)) return;
    const wrapped = await encryptKeyForUser(key, keyPairRef.current.publicKey);
    localStorage.setItem(storageKey, JSON.stringify([...saved, { fingerprint, wrapped }]));
  }, [userId]);

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
        await rememberSendingKey(conversationId, sharedKey);
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
            await rememberSendingKey(conversationId, sharedKey);
            conversationKeysRef.current.set(conversationId, sharedKey);
            return { key: sharedKey, shared: true };
          }
        }
      }

      // No peer key found — generate a new local key.
      // The caller (prepareConversation) will share it with peers.
      const key = await generateConversationKey();
      await rememberSendingKey(conversationId, key);
      conversationKeysRef.current.set(conversationId, key);
      return { key, shared: false };
    },
    [fetchSharedKey, rememberSendingKey],
  );

  /** Encrypt a message before sending */
  const encrypt = useCallback(
    async (plaintext: string, conversationId: string): Promise<string> => {
      const { key } = await getConversationKey(conversationId);
      return encryptMessage(plaintext, key);
    },
    [getConversationKey],
  );

  /** Receiving never generates or replaces a sending key. Try cached keys,
   * then all current/device/history shares, retaining keys that work locally. */
  const decrypt = useCallback(async (ciphertext: string, conversationId: string): Promise<string> => {
    if (!keyPairRef.current) throw new Error("Device keys are not ready");
    const local = decryptionKeysRef.current.get(conversationId) ?? [];
    const sending = conversationKeysRef.current.get(conversationId);
    for (const key of sending ? [sending, ...local] : local) {
      try { return await decryptMessage(ciphertext, key); } catch { /* Try the next key. */ }
    }
    if (userId && typeof localStorage !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(`e2ee_sentkeys_${userId}_${conversationId}`) ?? "[]") as Array<{ wrapped: string }>;
        for (const entry of saved) {
          try {
            const key = await decryptKeyFromSender(entry.wrapped, keyPairRef.current.privateKey);
            const plain = await decryptMessage(ciphertext, key);
            decryptionKeysRef.current.set(conversationId, [key, ...local].slice(0, 20));
            return plain;
          } catch { /* Another historical sending key. */ }
        }
      } catch { /* Server shares can still recover a malformed local backup. */ }
    }
    for (const endpoint of ["conversation-keys", "key-rotation/history"]) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`/api/e2ee/${endpoint}?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) continue;
        const data = await response.json();
        for (const row of data.keys ?? data.history ?? []) {
          try {
            const key = await decryptKeyFromSender(row.encryptedKey, keyPairRef.current.privateKey);
            const plain = await decryptMessage(ciphertext, key);
            decryptionKeysRef.current.set(conversationId, [key, ...local].slice(0, 20));
            return plain;
          } catch { /* This share belongs to another device or message. */ }
        }
      } catch { /* Try the history endpoint too. */ }
      finally { clearTimeout(timeout); }
    }
    throw new Error("This message's key is not available on this device");
  }, [userId, state.deviceId]);

  /** Share a conversation key with one specific recipient device. */
  const shareKey = useCallback(
    async (conversationId: string, targetUserId: string, targetDeviceId: string, targetPublicKeyBase64: string, keyOverride?: CryptoKey) => {
      const key = keyOverride ?? (await getConversationKey(conversationId)).key;
      const targetPublicKey = await importPublicKey(targetPublicKeyBase64);
      const encryptedKey = await encryptKeyForUser(key, targetPublicKey);

      const res = await fetch("/api/e2ee/conversation-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          targetUserId,
          targetDeviceId,
          encryptedKey,
          // This is the sender; targetDeviceId identifies the only device
          // that can unwrap this copy.
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
        const res = await fetch(`/api/e2ee/key-rotation/status?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
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
    [state.deviceId],
  );

  /** Publish a new sending key only after every recipient share succeeds. */
  const rotateConversationKey = useCallback(async (conversationId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/e2ee/peers?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
      if (!response.ok) return false;
      const { peers } = await response.json() as { peers: Peer[] };
      if (peers.some(peer => peer.devices.length === 0)) return false;
      const key = await generateConversationKey();
      for (const peer of peers) for (const device of peer.devices) {
        if (!await shareKey(conversationId, peer.userId, device.deviceId, device.publicKey, key)) return false;
      }
      const old = conversationKeysRef.current.get(conversationId);
      if (old) decryptionKeysRef.current.set(conversationId, [old, ...(decryptionKeysRef.current.get(conversationId) ?? [])]);
      await rememberSendingKey(conversationId, key);
      conversationKeysRef.current.set(conversationId, key);
      return true;
    } catch { return false; }
  }, [shareKey, rememberSendingKey]);

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
      const { key } = await getConversationKey(conversationId, { waitForPeer: true });
      let peers: Peer[] = [];
      try {
        const res = await fetch(`/api/e2ee/peers?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
        if (!res.ok) return { ready: false, fingerprint: null };
        if (res.ok) {
          const data = (await res.json()) as { peers?: Peer[] };
          peers = data.peers ?? [];
        }
      } catch {
        return { ready: false, fingerprint: null };
      }

      // No peers (self chat, fresh group with only you) → encryption works.
      let ready = peers.every((p) => p.devices.length > 0);
      if (ready) {
        for (const peer of peers) {
          for (const device of peer.devices) {
            try {
              if (!await shareKey(conversationId, peer.userId, device.deviceId, device.publicKey, key)) ready = false;
            } catch {
              ready = false;
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

  /** The wrapped file key uses the same recovery path as text messages. */
  const decryptMedia = useCallback(async (
    encryptedBytesB64: string, wrappedKeyB64: string, conversationId: string,
  ): Promise<ArrayBuffer> => {
    if (atob(encryptedBytesB64).length < 28) throw new Error("media_download_incomplete");
    const mediaKey = await importSymmetricKey(await decrypt(wrappedKeyB64, conversationId));
    return decryptBytes(encryptedBytesB64, mediaKey);
  }, [decrypt]);

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
