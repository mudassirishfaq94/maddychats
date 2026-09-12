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
import { mapWithConcurrency } from "@/lib/async";

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
  const decryptionLoadRef = useRef<Map<string, Promise<CryptoKey[]>>>(new Map());
  const preparedConversationsRef = useRef<Map<string, {
    fingerprint: string;
    peerSignature: string;
  }>>(new Map());

  // Initialize on mount
  useEffect(() => {
    if (!userId) return;

    async function init() {
      const deviceId = generateDeviceId();
      const stored = localStorage.getItem(`e2ee_keypair_${userId}`);
      const recoveryStorageKey = `e2ee_recovery_${userId}_${deviceId}`;
      let recoverySecret = localStorage.getItem(recoveryStorageKey);

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

      async function restorePrivateKey(encryptedBackup: string): Promise<string> {
        if (encryptedBackup.startsWith("v2:")) {
          if (!recoverySecret) throw new Error("Device recovery secret is unavailable");
          return decryptPrivateKeyFromStorage(encryptedBackup.slice(3), recoverySecret);
        }
        // One-time compatibility path for backups created by older clients,
        // which incorrectly used the public device id as their passphrase.
        return decryptPrivateKeyFromStorage(encryptedBackup, deviceId);
      }

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
          privateKeyStr = await restorePrivateKey(serverDevice.encryptedPrivateKey);
          const privateKey = await importPrivateKey(privateKeyStr);
          const publicKey = await importPublicKey(serverDevice.publicKey);
          keyPair = { privateKey, publicKey };
          publicKeyStr = serverDevice.publicKey;
          localStorage.setItem(`e2ee_keypair_${userId}`, JSON.stringify({ publicKey: publicKeyStr, privateKey: privateKeyStr }));
        } else {
          throw new Error("Encryption key recovery is unavailable");
        }
      } else if (serverDevice?.encryptedPrivateKey) {
        privateKeyStr = await restorePrivateKey(serverDevice.encryptedPrivateKey);
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
      // Keep the backup decryptable on this device without giving the server
      // its passphrase. The previous protocol stored deviceId beside the
      // backup, which did not provide meaningful protection from the server.
      if (!recoverySecret) {
        const secretBytes = crypto.getRandomValues(new Uint8Array(32));
        recoverySecret = Array.from(secretBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(recoveryStorageKey, recoverySecret);
      }
      const encryptedPrivateKey = `v2:${await encryptPrivateKeyForStorage(privateKeyStr, recoverySecret)}`;
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
            .sort((a: { keyVersion?: number; deviceId?: string }, b: { keyVersion?: number; deviceId?: string }) => {
              // Prefer this device's self-wrapped sending key. Other rows are
              // peer sending keys and remain available to the decrypt path.
              const selfA = a.deviceId === state.deviceId ? 1 : 0;
              const selfB = b.deviceId === state.deviceId ? 1 : 0;
              return selfB - selfA || (b.keyVersion ?? 0) - (a.keyVersion ?? 0);
            });
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

  /** Load and unwrap every key available to this device once per batch. Initial
   * history decrypts run concurrently; sharing this promise prevents every
   * message from independently repeating the same API and RSA work. */
  const loadDecryptionKeys = useCallback(async (conversationId: string): Promise<CryptoKey[]> => {
    const pending = decryptionLoadRef.current.get(conversationId);
    if (pending) return pending;

    const load = (async () => {
      if (!keyPairRef.current) throw new Error("Device keys are not ready");
      const wrappedKeys = new Set<string>();

      if (userId && typeof localStorage !== "undefined") {
        try {
          const saved = JSON.parse(localStorage.getItem(`e2ee_sentkeys_${userId}_${conversationId}`) ?? "[]") as Array<{ wrapped?: string }>;
          for (const entry of saved) if (entry.wrapped) wrappedKeys.add(entry.wrapped);
        } catch { /* Server shares can still recover a malformed local backup. */ }
      }

      await Promise.all(["conversation-keys", "key-rotation/history"].map(async (endpoint) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(`/api/e2ee/${endpoint}?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`, {
            cache: "no-store", signal: controller.signal,
          });
          if (!response.ok) return;
          const data = await response.json();
          for (const row of data.keys ?? data.history ?? []) {
            if (row.encryptedKey) wrappedKeys.add(row.encryptedKey);
          }
        } catch { /* The other endpoint or a later retry may still recover. */ }
        finally { clearTimeout(timeout); }
      }));

      const existing = decryptionKeysRef.current.get(conversationId) ?? [];
      const keys = [...existing];
      const fingerprints = new Set<string>();
      for (const key of existing) {
        try { fingerprints.add(await conversationFingerprint(key)); } catch {}
      }
      for (const wrapped of wrappedKeys) {
        try {
          const key = await decryptKeyFromSender(wrapped, keyPairRef.current.privateKey);
          const fingerprint = await conversationFingerprint(key);
          if (!fingerprints.has(fingerprint)) {
            fingerprints.add(fingerprint);
            keys.push(key);
          }
        } catch { /* This legacy share was wrapped for a different device. */ }
      }
      decryptionKeysRef.current.set(conversationId, keys);
      return keys;
    })();

    decryptionLoadRef.current.set(conversationId, load);
    try {
      return await load;
    } finally {
      if (decryptionLoadRef.current.get(conversationId) === load) {
        decryptionLoadRef.current.delete(conversationId);
      }
    }
  }, [userId, state.deviceId]);

  /** Receiving never generates or replaces a sending key. Try cached keys,
   * then current/device/history shares, retaining all recoverable keys. */
  const decrypt = useCallback(async (ciphertext: string, conversationId: string): Promise<string> => {
    if (!keyPairRef.current) throw new Error("Device keys are not ready");
    const local = decryptionKeysRef.current.get(conversationId) ?? [];
    const sending = conversationKeysRef.current.get(conversationId);
    for (const key of sending ? [sending, ...local] : local) {
      try { return await decryptMessage(ciphertext, key); } catch { /* Try the next key. */ }
    }
    const loaded = await loadDecryptionKeys(conversationId);
    for (const key of loaded) {
      try { return await decryptMessage(ciphertext, key); } catch { /* Try the next key. */ }
    }
    throw new Error("This message's key is not available on this device");
  }, [loadDecryptionKeys]);

  /** Share a conversation key with one specific recipient device. */
  const shareKey = useCallback(
    async (conversationId: string, targetUserId: string, targetDeviceId: string, targetPublicKeyBase64: string, keyOverride?: CryptoKey) => {
      const key = keyOverride ?? (await getConversationKey(conversationId)).key;
      const targetPublicKey = await importPublicKey(targetPublicKeyBase64);
      const encryptedKey = await encryptKeyForUser(key, targetPublicKey);
      const keyFingerprint = await conversationFingerprint(key);

      const res = await fetch("/api/e2ee/conversation-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          targetUserId,
          targetDeviceId,
          encryptedKey,
          keyFingerprint,
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
      if (peers.some(peer => peer.userId !== userId && peer.devices.length === 0)) return false;
      const key = await generateConversationKey();
      if (!userId || !state.publicKey) return false;
      const targets = [
        { userId, deviceId: state.deviceId, publicKey: state.publicKey },
        ...peers.flatMap((peer) => peer.devices.map((device) => ({
          userId: peer.userId, deviceId: device.deviceId, publicKey: device.publicKey,
        }))),
      ];
      const shared = await mapWithConcurrency(targets, 3, (target) =>
        shareKey(conversationId, target.userId, target.deviceId, target.publicKey, key));
      if (shared.some((success) => !success)) return false;
      const old = conversationKeysRef.current.get(conversationId);
      if (old) decryptionKeysRef.current.set(conversationId, [old, ...(decryptionKeysRef.current.get(conversationId) ?? [])]);
      await rememberSendingKey(conversationId, key);
      conversationKeysRef.current.set(conversationId, key);
      const fingerprint = await conversationFingerprint(key);
      preparedConversationsRef.current.set(conversationId, {
        fingerprint,
        peerSignature: targets
          .map((target) => `${target.userId}:${target.deviceId}:${target.publicKey}`)
          .sort()
          .join("|"),
      });
      return true;
    } catch { return false; }
  }, [shareKey, rememberSendingKey, state.deviceId, state.publicKey, userId]);

  /**
   * Prepare a conversation for E2EE: fetch-or-create its symmetric key, share
   * it to every device of every peer, and return the verification fingerprint.
   *
   * ready=false means at least one peer has no registered device key yet. The
   * caller must wait or fail closed; plaintext fallback is not permitted.
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

      // The current user is returned so their other devices receive the key,
      // but having no *other* device must not disable E2EE for the whole chat.
      let ready = Boolean(userId && state.publicKey) &&
        peers.every((p) => p.userId === userId || p.devices.length > 0);
      const peerSignature = ready
        ? [
            { userId: userId!, deviceId: state.deviceId, publicKey: state.publicKey! },
            ...peers.flatMap((peer) => peer.devices.map((device) => ({
              userId: peer.userId, deviceId: device.deviceId, publicKey: device.publicKey,
            }))),
          ].map((target) => `${target.userId}:${target.deviceId}:${target.publicKey}`).sort().join("|")
        : "";
      const prepared = preparedConversationsRef.current.get(conversationId);
      if (ready && prepared?.peerSignature === peerSignature) {
        return { ready: true, fingerprint: prepared.fingerprint };
      }
      if (ready) {
        // Include a self-wrapped recovery copy and publish all independent
        // recipient-device shares with bounded concurrency.
        const targets = [
          { userId: userId!, deviceId: state.deviceId, publicKey: state.publicKey! },
          ...peers.flatMap((peer) => peer.devices.map((device) => ({
            userId: peer.userId, deviceId: device.deviceId, publicKey: device.publicKey,
          }))),
        ];
        const shared = await mapWithConcurrency(targets, 3, async (target) => {
          try {
            return await shareKey(conversationId, target.userId, target.deviceId, target.publicKey, key);
          } catch {
            return false;
          }
        });
        if (shared.some((success) => !success)) ready = false;
      }

      let fingerprint: string | null = null;
      try {
        fingerprint = await conversationFingerprint(key);
      } catch {
        fingerprint = null;
      }
      if (ready && fingerprint) {
        preparedConversationsRef.current.set(conversationId, {
          fingerprint,
          // The peers endpoint is checked before every send. Shares are only
          // repeated when membership or registered device keys change.
          peerSignature,
        });
      }
      return { ready, fingerprint };
    },
    [getConversationKey, shareKey, state.deviceId, state.publicKey, userId],
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
