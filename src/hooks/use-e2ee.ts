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
  encryptPrivateKeyForStorage,
  decryptPrivateKeyFromStorage,
} from "@/lib/crypto";

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

  /** Decrypt a received message */
  const decrypt = useCallback(
    async (ciphertext: string, conversationId: string): Promise<string> => {
      const key = await getConversationKey(conversationId);
      return decryptMessage(ciphertext, key);
    },
    [getConversationKey],
  );

  /** Share conversation key with another user's device */
  const shareKey = useCallback(
    async (conversationId: string, targetUserId: string, targetDeviceId: string, targetPublicKeyBase64: string) => {
      const key = await getConversationKey(conversationId);
      const targetPublicKey = await importPublicKey(targetPublicKeyBase64);
      const encryptedKey = await encryptKeyForUser(key, targetPublicKey);

      await fetch("/api/e2ee/conversation-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          targetUserId,
          encryptedKey,
          deviceId: state.deviceId,
        }),
      });
    },
    [getConversationKey, state.deviceId],
  );

  return {
    ...state,
    encrypt,
    decrypt,
    shareKey,
    getConversationKey,
  };
}
