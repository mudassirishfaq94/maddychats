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
import { e2eeRequest, awaitE2EERead } from "@/lib/e2ee-request";
import { mapWithConcurrency } from "@/lib/async";
import { loadSignalBridge } from "@/lib/e2ee-signal-bridge";
import { ensureSignalDeviceRegistered, maintainSignalPrekeyReserve } from "@/lib/e2ee-signal-registration";
import {
  getMessageCacheKey,
  readVerifiedMessage,
  writeVerifiedMessage,
} from "@/lib/e2ee-message-cache";

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
  const deviceRegistrationRef = useRef<Promise<boolean> | null>(null);
  const conversationKeysRef = useRef<Map<string, CryptoKey>>(new Map());

  const decryptionKeysRef = useRef<Map<string, CryptoKey[]>>(new Map());
  const decryptionLoadRef = useRef<Map<string, Promise<CryptoKey[]>>>(new Map());
  // Deliberately memory-only. Plaintext never survives a reload or crosses an
  // account boundary, but returning to a chat in the same signed-in session
  // can render already authenticated text without repeating crypto work.
  const decryptedMessageCacheRef = useRef<Map<string, { ciphertext: string; plaintext: string }>>(new Map());
  const messageCacheKeyRef = useRef<Promise<CryptoKey> | null>(null);
  const preparedConversationsRef = useRef<Map<string, {
    fingerprint: string;
    peerSignature: string;
  }>>(new Map());
  const pendingTrustRef = useRef<Map<string, string>>(new Map());

  // Initialize on mount
  useEffect(() => {
    if (!userId) return;
    const activeUserId = userId;
    messageCacheKeyRef.current = null;

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
      const backupResponse = !stored ? await e2eeRequest("/api/e2ee/keys", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }) : null;
      if (backupResponse && !backupResponse.ok) throw new Error("Device key lookup failed");
      const backupData = backupResponse ? await backupResponse.json() as {
        keys?: Array<{ deviceId: string; publicKey: string; encryptedPrivateKey?: string }>;
      } : null;
      const serverDevice = backupData?.keys?.find((key) => key.deviceId === deviceId);

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
        const parsed = JSON.parse(stored) as {
          publicKey?: unknown;
          privateKey?: unknown;
          encryptedPrivateKey?: unknown;
        };
        if (typeof parsed.publicKey !== "string") {
          throw new Error("Stored encryption key is invalid");
        }
        // A matching server key confirms this browser copy is the correct
        // keypair. If it differs, restore the server backup instead of
        // registering the stale local key over the recoverable one.
        if (!serverDevice || serverDevice.publicKey === parsed.publicKey) {
          // v2 is the normal format. `privateKey` is accepted only to migrate
          // a legacy local record; the successful registration below rewrites
          // it immediately as an encrypted record.
          privateKeyStr = typeof parsed.encryptedPrivateKey === "string"
            ? await restorePrivateKey(parsed.encryptedPrivateKey)
            : typeof parsed.privateKey === "string"
              ? parsed.privateKey
              : (() => { throw new Error("Stored encryption key is invalid"); })();
          const privateKey = await importPrivateKey(privateKeyStr);
          const publicKey = await importPublicKey(parsed.publicKey);
          keyPair = { privateKey, publicKey };
          publicKeyStr = parsed.publicKey;
        } else if (serverDevice.encryptedPrivateKey) {
          privateKeyStr = await restorePrivateKey(serverDevice.encryptedPrivateKey);
          const privateKey = await importPrivateKey(privateKeyStr);
          const publicKey = await importPublicKey(serverDevice.publicKey);
          keyPair = { privateKey, publicKey };
          publicKeyStr = serverDevice.publicKey;
        } else {
          throw new Error("Encryption key recovery is unavailable");
        }
      } else if (serverDevice?.encryptedPrivateKey) {
        privateKeyStr = await restorePrivateKey(serverDevice.encryptedPrivateKey);
        const privateKey = await importPrivateKey(privateKeyStr);
        const publicKey = await importPublicKey(serverDevice.publicKey);
        keyPair = { privateKey, publicKey };
        publicKeyStr = serverDevice.publicKey;
      } else {
        keyPair = await generateKeyPair();
        const publicKey = await exportPublicKey(keyPair.publicKey);
        publicKeyStr = publicKey;
        const privateKey = await exportPrivateKey(keyPair.privateKey);
        privateKeyStr = privateKey;

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
      // Never persist the raw, exportable JWK. This also migrates legacy
      // browser records after their next successful initialization.
      localStorage.setItem(
        `e2ee_keypair_${userId}`,
        JSON.stringify({ publicKey: publicKeyStr, encryptedPrivateKey }),
      );
      // The local private key and locally wrapped conversation keys are enough
      // to authenticate existing history. Do not hold that render path behind
      // a device-directory POST. Sending still waits for this promise below.
      keyPairRef.current = keyPair;

      setState({
        initialized: true,
        deviceId,
        publicKey: publicKeyStr,
        loading: false,
        error: null,
      });

      const registration = e2eeRequest("/api/e2ee/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, publicKey: publicKeyStr, encryptedPrivateKey }),
        signal: AbortSignal.timeout(15000),
      }).then(async (response) => {
        if (!response.ok) {
          setState(previous => ({ ...previous, error: "Device registration failed. Reload to retry; your keys were preserved." }));
          return false;
        }
        const registration = await response.json() as { pendingApproval?: boolean };
        if (registration.pendingApproval) {
          setState(previous => ({ ...previous, error: "This device needs approval. On a trusted device, open Profile > Devices and approve this device before restoring chat keys." }));
          return false;
        }
        return true;
      }).catch(() => false);
      deviceRegistrationRef.current = registration;

      // Register the Signal device directory independently of the legacy
      // compatibility key. A temporary Signal-directory outage must not make
      // already-established conversations unreadable; v2 sending is enabled
      // only after its session ratchet is available.
      void loadSignalBridge()
        .then(async (bridge) => {
          await ensureSignalDeviceRegistered(activeUserId, deviceId, bridge);
          await maintainSignalPrekeyReserve(activeUserId, deviceId, bridge);
        })
        .catch(() => {
          // Retried at the next application initialization. Do not expose a
          // silent fallback that would create a replacement Signal identity.
        });

    }

    init().catch((cause: unknown) => setState((prev) => ({
      ...prev, initialized: false, loading: false,
      error: cause instanceof Error && cause.message === "Device recovery secret is unavailable"
        ? "Browser storage no longer contains this device's recovery secret. Use a trusted device that can still read your messages to approve and restore a new device."
        : "Encryption could not be initialized on this device. Reload to try again; existing keys were preserved.",
    })));
  }, [userId]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Fetch a shared conversation key from the server (other user's share). */
  const fetchSharedKey = useCallback(
    async (conversationId: string): Promise<CryptoKey | null> => {
      try {
        const res = await e2eeRequest(`/api/e2ee/conversation-keys?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
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

  /** Restore keys previously wrapped for *this* device before using the
   * network. These are ciphertext at rest, not plaintext or raw AES keys. */
  const loadLocalConversationKeys = useCallback(async (conversationId: string): Promise<CryptoKey[]> => {
    if (!userId || !keyPairRef.current || typeof localStorage === "undefined") return [];
    let saved: Array<{ wrapped?: string }> = [];
    try {
      saved = JSON.parse(localStorage.getItem(`e2ee_sentkeys_${userId}_${conversationId}`) ?? "[]") as Array<{ wrapped?: string }>;
    } catch {
      return [];
    }
    const existing = decryptionKeysRef.current.get(conversationId) ?? [];
    const keys = [...existing];
    const fingerprints = new Set<string>();
    for (const key of existing) {
      try { fingerprints.add(await conversationFingerprint(key)); } catch {}
    }
    for (const entry of saved) {
      if (!entry.wrapped) continue;
      try {
        const key = await decryptKeyFromSender(entry.wrapped, keyPairRef.current.privateKey);
        const fingerprint = await conversationFingerprint(key);
        if (!fingerprints.has(fingerprint)) {
          fingerprints.add(fingerprint);
          keys.push(key);
        }
      } catch { /* A corrupt local entry must not block other messages. */ }
    }
    decryptionKeysRef.current.set(conversationId, keys);
    return keys;
  }, [userId]);

  /**
   * Return the established legacy symmetric key for a conversation.
   *
   * This legacy key transport must fail closed. Generating a replacement key
   * after a fetch race creates ciphertext that the other devices can never
   * decrypt. Session bootstrap is being replaced by per-device Signal-style
   * sessions; until then callers queue the action and retry instead.
   *
   * A missing key is an explicit, retryable session-not-ready failure.
   */
  const getConversationKey = useCallback(
    async (
      conversationId: string,
      { waitForPeer: _waitForPeer = false }: { waitForPeer?: boolean } = {},
    ): Promise<{ key: CryptoKey; shared: boolean }> => {
      const cached = conversationKeysRef.current.get(conversationId);
      if (cached) return { key: cached, shared: true };

      // A previously established key is already wrapped to this device. Use
      // it immediately rather than waiting on a server lookup after reload.
      const localKeys = await loadLocalConversationKeys(conversationId);
      const newestLocalKey = localKeys.at(-1);
      if (newestLocalKey) {
        conversationKeysRef.current.set(conversationId, newestLocalKey);
        return { key: newestLocalKey, shared: true };
      }

      // Try to load a shared key from the server
      let sharedKey = await fetchSharedKey(conversationId);
      if (sharedKey) {
        await rememberSendingKey(conversationId, sharedKey);
        conversationKeysRef.current.set(conversationId, sharedKey);
        return { key: sharedKey, shared: true };
      }

      throw new Error("E2EE_SESSION_NOT_READY");
    },
    [fetchSharedKey, loadLocalConversationKeys, rememberSendingKey],
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
  const loadDecryptionKeys = useCallback(async (conversationId: string, rawHistory = false): Promise<CryptoKey[]> => {
    const loadId = `${conversationId}:${rawHistory ? "raw" : "compact"}`;
    const pending = decryptionLoadRef.current.get(loadId);
    if (pending) return pending;

    const load = (async () => {
      if (!keyPairRef.current) throw new Error("Device keys are not ready");
      const wrappedKeys = new Set<string>();
      // Local, device-wrapped keys are available without a round trip. The
      // decrypt path tries these before awaiting this background reconciliation.
      await loadLocalConversationKeys(conversationId);

      await Promise.all(["conversation-keys", "key-rotation/history"].map(async (endpoint) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          let cursor: string | null = null;
          const seenCursors = new Set<string>();
          do {
            const query = new URLSearchParams({ conversationId, deviceId: state.deviceId });
            if (endpoint === "key-rotation/history" && !rawHistory) query.set("compact", "1");
            if (cursor) query.set("cursor", cursor);
            const response = await e2eeRequest(`/api/e2ee/${endpoint}?${query}`, {
              cache: "no-store", signal: controller.signal,
            });
            if (!response.ok) return;
            const data = await response.json();
            for (const row of data.keys ?? data.history ?? []) {
              if (row.encryptedKey) wrappedKeys.add(row.encryptedKey);
            }
            cursor = data.nextCursor ?? null;
            if (cursor && seenCursors.has(cursor)) break;
            if (cursor) seenCursors.add(cursor);
          } while (cursor && !controller.signal.aborted);
        } catch { /* The other endpoint or a later retry may still recover. */ }
        finally { clearTimeout(timeout); }
      }));

      const existing = decryptionKeysRef.current.get(conversationId) ?? [];
      const keys = [...existing];
      const fingerprints = new Set<string>();
      for (const key of existing) {
        try { fingerprints.add(await conversationFingerprint(key)); } catch {}
      }
      let processed = 0;
      for (const wrapped of wrappedKeys) {
        if (++processed % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
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

    decryptionLoadRef.current.set(loadId, load);
    try {
      return await load;
    } finally {
      if (decryptionLoadRef.current.get(loadId) === load) {
        decryptionLoadRef.current.delete(loadId);
      }
    }
  }, [loadLocalConversationKeys, state.deviceId]);

  /** Receiving never generates or replaces a sending key. Try cached keys,
   * then current/device/history shares, retaining all recoverable keys. */
  const decrypt = useCallback(async (ciphertext: string, conversationId: string): Promise<string> => {
    if (!keyPairRef.current) throw new Error("Device keys are not ready");
    const local = decryptionKeysRef.current.get(conversationId) ?? [];
    const sending = conversationKeysRef.current.get(conversationId);
    for (const key of sending ? [sending, ...local] : local) {
      try { return await decryptMessage(ciphertext, key); } catch { /* Try the next key. */ }
    }
    // This is the reload critical path: unwrap only the local, device-wrapped
    // keys first. Server key history reconciliation remains a fallback.
    const restored = await loadLocalConversationKeys(conversationId);
    for (const key of restored) {
      try { return await decryptMessage(ciphertext, key); } catch { /* Try the next key. */ }
    }
    const loaded = await loadDecryptionKeys(conversationId);
    for (const key of loaded) {
      try { return await decryptMessage(ciphertext, key); } catch { /* Try the next key. */ }
    }
    // A compact copy may belong to a legacy device whose public key changed.
    // Retry the original wraps without discarding historical recovery data.
    for (const key of await loadDecryptionKeys(conversationId, true)) {
      try { return await decryptMessage(ciphertext, key); } catch { /* Try the next key. */ }
    }
    throw new Error("This message's key is not available on this device");
  }, [loadDecryptionKeys, loadLocalConversationKeys]);

  /** Share a conversation key with one specific recipient device. */
  const shareKey = useCallback(
    async (conversationId: string, targetUserId: string, targetDeviceId: string, targetPublicKeyBase64: string, keyOverride?: CryptoKey, signal?: AbortSignal) => {
      signal?.throwIfAborted();
      const key = keyOverride ?? (await getConversationKey(conversationId)).key;
      const targetPublicKey = await importPublicKey(targetPublicKeyBase64);
      const encryptedKey = await encryptKeyForUser(key, targetPublicKey);
      const keyFingerprint = await conversationFingerprint(key);

      signal?.throwIfAborted();
      const res = await e2eeRequest("/api/e2ee/conversation-keys", {
        signal,
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
        const res = await e2eeRequest(`/api/e2ee/key-rotation/status?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
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
      const response = await e2eeRequest(`/api/e2ee/peers?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
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

  /** Create the first conversation key once and wrap it for every current
   * device. If another device won the bootstrap race, load its key instead. */
  const bootstrapConversationKey = useCallback(async (
    conversationId: string,
    targets: Array<{ userId: string; deviceId: string; publicKey: string }>,
  ): Promise<CryptoKey | null> => {
    if (!userId || !state.deviceId) return null;
    const candidate = await generateConversationKey();
    const keyFingerprint = await conversationFingerprint(candidate);
    const shares = await mapWithConcurrency(targets, 3, async (target) => ({
      targetUserId: target.userId,
      targetDeviceId: target.deviceId,
      encryptedKey: await encryptKeyForUser(candidate, await importPublicKey(target.publicKey)),
      keyFingerprint,
    }));
    const response = await e2eeRequest("/api/e2ee/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, deviceId: state.deviceId, shares }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { created?: boolean };
    if (!data.created) return fetchSharedKey(conversationId);
    await rememberSendingKey(conversationId, candidate);
    conversationKeysRef.current.set(conversationId, candidate);
    decryptionKeysRef.current.set(conversationId, [candidate]);
    return candidate;
  }, [fetchSharedKey, rememberSendingKey, state.deviceId, userId]);

  /**
   * Prepare a conversation for E2EE: fetch-or-create its symmetric key, share
   * it to every device of every peer, and return the verification fingerprint.
   *
   * ready=false means at least one peer has no registered device key yet. The
   * caller must wait or fail closed; plaintext fallback is not permitted.
   */
  const prepareConversation = useCallback(
    async (conversationId: string, { forceReshare = false }: { forceReshare?: boolean } = {}): Promise<{ ready: boolean; fingerprint: string | null; trustChanged?: boolean; missingPeers?: number }> => {
      // Existing history may use local keys immediately, but publishing or
      // sharing a new key must not race device registration.
      if (deviceRegistrationRef.current && !(await deviceRegistrationRef.current)) {
        return { ready: false, fingerprint: null };
      }
      // Device discovery and this device's existing-key lookup are independent
      // network operations. Starting both together removes one round trip from
      // every chat open.
      const existingKeyPromise = getConversationKey(conversationId, { waitForPeer: true })
        .then(({ key }) => key)
        .catch(() => null);
      let peers: Peer[] = [];
      try {
        const res = await e2eeRequest(`/api/e2ee/peers?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`);
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
      const missingPeers = peers.filter((peer) => peer.userId !== userId && peer.devices.length === 0).length;
      const targets = ready
        ? [
            { userId: userId!, deviceId: state.deviceId, publicKey: state.publicKey! },
            ...peers.flatMap((peer) => peer.devices.map((device) => ({
              userId: peer.userId, deviceId: device.deviceId, publicKey: device.publicKey,
            }))),
          ]
        : [];
      // A brand-new conversation has no key to fetch. Bootstrap it only once
      // every participant device is registered; the server lock prevents two
      // simultaneous first sends from establishing different keys.
      let key: CryptoKey;
      const existingKey = await existingKeyPromise;
      if (existingKey) {
        key = existingKey;
      } else {
        if (!ready) return { ready: false, fingerprint: null };
        const bootstrapped = await bootstrapConversationKey(conversationId, targets);
        if (!bootstrapped) return { ready: false, fingerprint: null };
        key = bootstrapped;
      }
      const peerSignature = targets
        .map((target) => `${target.userId}:${target.deviceId}:${target.publicKey}`)
        .sort()
        .join("|");
      // An account's own newly authenticated device is a normal multi-device
      // event: it must receive the owner's existing conversation key so it can
      // show the same history. Only changes to another participant's devices
      // need an out-of-band safety-number approval.
      const trustSignature = targets
        .filter((target) => target.userId !== userId)
        .map((target) => `${target.userId}:${target.deviceId}:${target.publicKey}`)
        .sort()
        .join("|");
      // Trust-on-first-use: the first observed device set is pinned locally.
      // A later replacement/addition blocks new encryption until the user has
      // compared the conversation fingerprint and explicitly approved it.
      const trustKey = `e2ee_trust_${userId}_${conversationId}`;
      const trusted = typeof localStorage === "undefined" ? null : localStorage.getItem(trustKey);
      // Previous clients stored the full device set (including this user's
      // own devices). Preserve that trust decision and migrate it in place so
      // an app upgrade does not spuriously block every established chat.
      const legacyPeerSignature = trusted
        ?.split("|")
        .filter((entry) => !entry.startsWith(`${userId}:`))
        .sort()
        .join("|");
      if (ready && trusted && legacyPeerSignature === trustSignature && trusted !== trustSignature && typeof localStorage !== "undefined") {
        localStorage.setItem(trustKey, trustSignature);
      }
      if (ready && trusted && trusted !== trustSignature && legacyPeerSignature !== trustSignature) {
        pendingTrustRef.current.set(conversationId, trustSignature);
        return { ready: false, fingerprint: null, trustChanged: true };
      }
      if (ready && !trusted && typeof localStorage !== "undefined") {
        localStorage.setItem(trustKey, trustSignature);
      }
      let fingerprint: string | null = null;
      try {
        fingerprint = await conversationFingerprint(key);
      } catch {
        fingerprint = null;
      }
      const prepared = preparedConversationsRef.current.get(conversationId);
      if (ready && !forceReshare && prepared?.peerSignature === peerSignature) {
        return { ready: true, fingerprint: prepared.fingerprint, missingPeers };
      }
      // Avoid re-uploading identical RSA-wrapped key copies after a refresh
      // or navigation. This is especially important for accounts with several
      // registered devices: one chat open used to fan out a write per device.
      const persistedKey = `e2ee_prepared_${userId}_${conversationId}`;
      const persisted = typeof localStorage === "undefined" ? null : (() => {
        try {
          return JSON.parse(localStorage.getItem(persistedKey) ?? "null") as {
            fingerprint?: string;
            peerSignature?: string;
          } | null;
        } catch {
          return null;
        }
      })();
      if (ready && !forceReshare && fingerprint &&
        persisted?.fingerprint === fingerprint && persisted.peerSignature === peerSignature) {
        preparedConversationsRef.current.set(conversationId, { fingerprint, peerSignature });
        return { ready: true, fingerprint, missingPeers };
      }
      if (ready) {
        // Include a self-wrapped recovery copy and publish all independent
        // recipient-device shares with bounded concurrency.
        const shared = await mapWithConcurrency(targets, 3, async (target) => {
          try {
            return await shareKey(conversationId, target.userId, target.deviceId, target.publicKey, key);
          } catch {
            return false;
          }
        });
        if (shared.some((success) => !success)) ready = false;
      }

      if (ready && fingerprint) {
        preparedConversationsRef.current.set(conversationId, {
          fingerprint,
          // The peers endpoint is checked before every send. Shares are only
          // repeated when membership or registered device keys change.
          peerSignature,
        });
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(persistedKey, JSON.stringify({ fingerprint, peerSignature }));
        }
      }
      return { ready, fingerprint, missingPeers };
    },
    [bootstrapConversationKey, getConversationKey, shareKey, state.deviceId, state.publicKey, userId],
  );

  /** Accept a detected device-set change only after out-of-band verification. */
  const approvePeerKeyChange = useCallback((conversationId: string): boolean => {
    const pending = pendingTrustRef.current.get(conversationId);
    if (!pending || typeof localStorage === "undefined") return false;
    localStorage.setItem(`e2ee_trust_${userId}_${conversationId}`, pending);
    pendingTrustRef.current.delete(conversationId);
    preparedConversationsRef.current.delete(conversationId);
    return true;
  }, [userId]);

  /**
   * Re-publish this device's current conversation keys whenever an account
   * gains another signed-in device. This is the missing multi-device handoff:
   * the server only stores wrapped keys and therefore cannot manufacture a
   * copy for a new Android device by itself. An already-authorized device
   * must wrap its key to the new device's public key.
   */
  const syncKnownConversations = useCallback(async (conversationId?: string): Promise<string> => {
    if (!state.initialized || !userId || !state.publicKey) throw new Error("Device keys are not ready. Use a trusted device that can already read this chat.");
    if (!conversationId) throw new Error("Open the chat you want to restore first.");
    // Recovery shares existing keys only, and never creates a replacement key.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const signal = controller.signal;
    try {
      const response = await e2eeRequest(
        `/api/e2ee/peers?conversationId=${encodeURIComponent(conversationId)}&deviceId=${encodeURIComponent(state.deviceId)}`,
        { cache: "no-store", signal },
      );
      if (!response.ok) throw new Error("Unable to check trusted devices. Please retry.");
      const data = await response.json() as { peers?: Peer[] };
      const devices = (data.peers ?? []).filter(peer => peer.userId === userId).flatMap(peer => peer.devices);
      if (!devices.length) return "No other trusted devices found. Approve your new device in Profile > Devices first.";
      const available = await awaitE2EERead(loadDecryptionKeys(conversationId), signal);
      signal.throwIfAborted();
      const current = conversationKeysRef.current.get(conversationId);
      const unique = new Map<string, CryptoKey>();
      for (const key of current ? [...available, current] : available) {
        signal.throwIfAborted();
        unique.set(await conversationFingerprint(key), key);
      }
      if (!unique.size) throw new Error("This device has no recoverable keys. Restore from a device that can already read these messages.");
      const currentFingerprint = current ? await conversationFingerprint(current) : null;
      const keys = [...unique.entries()].sort(([a], [b]) => Number(a === currentFingerprint) - Number(b === currentFingerprint)).map(([, key]) => key);
      // Preserve history order per device; write the active key last.
      await mapWithConcurrency(devices, 2, async device => {
        for (const key of keys) {
          signal.throwIfAborted();
          if (!await shareKey(conversationId, userId, device.deviceId, device.publicKey, key, signal)) throw new Error("Some keys could not be restored. Please retry from this trusted device.");
        }
      });
      signal.throwIfAborted();
      return `Shared ${keys.length} existing key(s) with ${devices.length} trusted device(s). Reopen this chat there.`;
    } catch (cause) {
      const timedOut = signal.aborted;
      controller.abort();
      if (timedOut) throw new Error("Restoration timed out. Check your connection and retry; existing keys were preserved.");
      throw cause;
    } finally { clearTimeout(timeout); }
  }, [loadDecryptionKeys, shareKey, state.deviceId, state.initialized, state.publicKey, userId]);

  const waitForDeviceRegistration = useCallback(async () => { await deviceRegistrationRef.current; }, []);

  const approveDevice = useCallback(async (targetDeviceId: string, targetFingerprint: string) => {
    if (!keyPairRef.current || !state.initialized) throw new Error("Trusted device keys are not ready.");
    const request = async (body: Record<string, string>) => {
      const response = await e2eeRequest("/api/e2ee/devices/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { token?: string; encryptedChallenge?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Device approval failed.");
      return data;
    };
    const challenge = await request({ action: "challenge", sourceDeviceId: state.deviceId, targetDeviceId, targetFingerprint });
    if (!challenge.token || !challenge.encryptedChallenge) throw new Error("Invalid device approval challenge.");
    const ciphertext = Uint8Array.from(atob(challenge.encryptedChallenge), char => char.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, keyPairRef.current.privateKey, ciphertext);
    const proof = new TextDecoder().decode(plaintext);
    await request({ action: "approve", token: challenge.token, proof });
  }, [state.deviceId, state.initialized]);

  // Do not continually re-publish legacy conversation keys. Re-sharing every
  // minute causes avoidable database work and can race with device bootstrap.
  // A deliberate, authenticated device-link flow will replace this mechanism.

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

  /** The wrapped file key uses the same recovery path as text messages.
   *  Includes retry logic because media keys may arrive slightly after the
   *  message itself (key sharing is async).
   */
  const decryptMedia = useCallback(async (
    encryptedBytesB64: string, wrappedKeyB64: string, conversationId: string,
  ): Promise<ArrayBuffer> => {
    if (atob(encryptedBytesB64).length < 28) throw new Error("media_download_incomplete");
    let lastError: unknown;
    // Try up to 3 times with increasing delay — the key may still be in-flight.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const mediaKey = await importSymmetricKey(await decrypt(wrappedKeyB64, conversationId));
        return decryptBytes(encryptedBytesB64, mediaKey);
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          // Clear cached keys so the next attempt re-fetches from the server.
          decryptionKeysRef.current.delete(conversationId);
          await sleep(1500 + attempt * 1000);
        }
      }
    }
    throw lastError;
  }, [decrypt]);

  const getCachedDecryptedMessage = useCallback((conversationId: string, messageId: string, ciphertext: string) => {
    const entry = decryptedMessageCacheRef.current.get(`${conversationId}:${messageId}`);
    return entry?.ciphertext === ciphertext ? entry.plaintext : undefined;
  }, []);

  const cacheDecryptedMessage = useCallback((conversationId: string, messageId: string, ciphertext: string, plaintext: string) => {
    decryptedMessageCacheRef.current.set(`${conversationId}:${messageId}`, { ciphertext, plaintext });
    if (!userId || !state.deviceId || !keyPairRef.current) return;
    if (!messageCacheKeyRef.current) {
      messageCacheKeyRef.current = getMessageCacheKey(userId, state.deviceId, keyPairRef.current);
    }
    // Persistence is deliberately off the render/decryption critical path.
    void messageCacheKeyRef.current
      .then((cacheKey) => writeVerifiedMessage(cacheKey, userId, conversationId, messageId, ciphertext, plaintext))
      .catch(() => { /* Cache is optional; never affect message delivery. */ });
  }, [state.deviceId, userId]);

  const loadCachedDecryptedMessages = useCallback(async (
    conversationId: string,
    messages: Array<{ id: string; text: string; encrypted: boolean }>,
  ): Promise<Map<string, string>> => {
    if (!userId || !state.deviceId || !keyPairRef.current) return new Map();
    if (!messageCacheKeyRef.current) {
      messageCacheKeyRef.current = getMessageCacheKey(userId, state.deviceId, keyPairRef.current);
    }
    try {
      const cacheKey = await messageCacheKeyRef.current;
      const cached = await mapWithConcurrency(messages.filter((message) => message.encrypted), 4, async (message) => {
        const plaintext = await readVerifiedMessage(cacheKey, userId, conversationId, message.id, message.text);
        return plaintext === undefined ? null : [message.id, plaintext] as const;
      });
      return new Map(cached.filter((entry): entry is readonly [string, string] => entry !== null));
    } catch {
      return new Map();
    }
  }, [state.deviceId, userId]);

  return {
    ...state,
    encrypt,
    decrypt,
    shareKey,
    getConversationKey,
    prepareConversation,
    syncKnownConversations,
    approveDevice,
    waitForDeviceRegistration,
    approvePeerKeyChange,
    encryptBytesForConversation,
    decryptBytesForConversation,
    decryptMedia,
    getCachedDecryptedMessage,
    cacheDecryptedMessage,
    loadCachedDecryptedMessages,
    // Key rotation
    checkRotationNeeded,
    rotateConversationKey,
  };
}
