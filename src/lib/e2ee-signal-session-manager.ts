import "client-only";

/**
 * **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
 * undergone formal security audit. DO NOT use in production without external
 * cryptographic review.
 *
 * **CRITICAL LIMITATIONS:**
 * - Session encryption uses placeholder AES-GCM (not real encryption)
 * - Message key derivation is simplified
 * - Forward secrecy not verified
 * - No key rotation on compromise
 *
 * **REQUIRED BEFORE PRODUCTION:**
 * - Real AES-GCM encryption implementation
 * - Proper HKDF key derivation
 * - Forward secrecy verification
 * - Key rotation mechanism
 * - Formal security review
 */

import { SignalLocalStore } from "./e2ee-signal-store";
import { SignalSessionState, signalSessionAddress } from "./e2ee-signal-session-state";
import { loadSignalBridge } from "./e2ee-signal-bridge";
import {
  getCachedSession,
  cacheSession,
  measureEncryption,
  measureDecryption,
} from "./e2ee-performance";
import { KeyRotationManager } from "./e2ee-key-rotation";
import {
  generateAESKey,
  encryptMessageForTransport,
  decryptMessageFromTransport,
  deriveKeyFromSecret,
  constantTimeCompare,
} from "./e2ee-crypto";

const ENCRYPTION_NAMESPACE = "signal-encryption-v2";

export interface EncryptedMessage {
  ciphertext: string;
  messageKey: string;
  timestamp: number;
}

export interface DecryptedMessage {
  plaintext: string;
  timestamp: number;
}

/**
 * Session manager for Double Ratchet encryption/decryption.
 * This manages the cryptographic state for each device pair.
 */
export class SignalSessionManager {
  private store: SignalLocalStore;
  private userId: string;
  private deviceId: string;

  private constructor(store: SignalLocalStore, userId: string, deviceId: string) {
    this.store = store;
    this.userId = userId;
    this.deviceId = deviceId;
  }

  static async open(userId: string, deviceId: string): Promise<SignalSessionManager> {
    const store = await SignalLocalStore.open();
    return new SignalSessionManager(store, userId, deviceId);
  }

  /**
   * Encrypt a message for a specific recipient device.
   * Uses the Double Ratchet session state for forward secrecy.
   */
  async encryptMessage(
    remoteUserId: string,
    remoteDeviceId: string,
    plaintext: string
  ): Promise<EncryptedMessage> {
    const bridge = await loadSignalBridge();
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    
    try {
      // Check for compromised keys
      const keyRotationManager = await KeyRotationManager.open(this.userId, this.deviceId);
      const isCompromised = await keyRotationManager.isKeyCompromised(remoteUserId, remoteDeviceId);
      keyRotationManager.close();
      
      if (isCompromised) {
        throw new Error("key_compromised");
      }

      // Check session cache first for performance
      let sessionRecordBytes = getCachedSession(remoteUserId, remoteDeviceId);
      if (!sessionRecordBytes) {
        // Load the session record for this device pair
        sessionRecordBytes = await sessionState.loadSession(remoteUserId, remoteDeviceId);
        if (!sessionRecordBytes) {
          throw new Error("no_session_established");
        }
        // Cache the session for future use
        cacheSession(remoteUserId, remoteDeviceId, sessionRecordBytes);
      }

      // Get the sender chain key from the session record
      const chainKey = await bridge.get_sender_chain_key(sessionRecordBytes!);
      
      // Derive message key from chain key
      const messageKey = await this.deriveMessageKey(chainKey);
      
      // Measure encryption performance
      const { result: ciphertext, time: encryptionTime } = await measureEncryption(async () => {
        return encryptMessageForTransport(
          messageKey,
          plaintext,
          this.userId,
          remoteUserId
        );
      });

      // Store the encrypted message locally (not on server)
      const sessionAddress = signalSessionAddress(remoteUserId, remoteDeviceId);
      const encryptedMessage: EncryptedMessage = {
        ciphertext,
        messageKey: sessionAddress,
        timestamp: Date.now(),
      };

      // Save to local encrypted storage
      await this.store.saveBytes(
        `${ENCRYPTION_NAMESPACE}:${sessionAddress}`,
        this.userId,
        this.deviceId,
        new TextEncoder().encode(JSON.stringify(encryptedMessage))
      );

      return encryptedMessage;
    } finally {
      sessionState.close();
    }
  }

  /**
   * Decrypt a message from a specific sender device.
   * Uses the Double Ratchet session state for forward secrecy.
   */
  async decryptMessage(
    senderUserId: string,
    senderDeviceId: string,
    ciphertext: string
  ): Promise<DecryptedMessage> {
    const bridge = await loadSignalBridge();
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    
    try {
      // Check for compromised keys
      const keyRotationManager = await KeyRotationManager.open(this.userId, this.deviceId);
      const isCompromised = await keyRotationManager.isKeyCompromised(senderUserId, senderDeviceId);
      keyRotationManager.close();
      
      if (isCompromised) {
        throw new Error("key_compromised");
      }

      // Check session cache first for performance
      let sessionRecordBytes = getCachedSession(senderUserId, senderDeviceId);
      if (!sessionRecordBytes) {
        // Load the session record for this device pair
        sessionRecordBytes = await sessionState.loadSession(senderUserId, senderDeviceId);
        if (!sessionRecordBytes) {
          throw new Error("no_session_established");
        }
        // Cache the session for future use
        cacheSession(senderUserId, senderDeviceId, sessionRecordBytes);
      }

      // Get the receiver chain key from the session record
      const chainKey = await bridge.get_receiver_chain_key(sessionRecordBytes!);
      
      // Derive message key from chain key
      const messageKey = await this.deriveMessageKey(chainKey);
      
      // Measure decryption performance
      const { result: plaintext, time: decryptionTime } = await measureDecryption(async () => {
        return decryptMessageFromTransport(
          messageKey,
          ciphertext,
          senderUserId,
          this.userId
        );
      });

      return {
        plaintext,
        timestamp: Date.now(),
      };
    } finally {
      sessionState.close();
    }
  }

  /**
   * Establish a new session with a remote device using their prekey bundle.
   */
  async establishSession(
    remoteUserId: string,
    remoteDeviceId: string,
    prekeyBundle: {
      identityKey: string;
      signedPrekey: { keyId: number; publicKey: string; signature: string };
      kyberPrekey: { keyId: number; publicKey: string; signature: string };
      oneTimePrekey?: { keyId: number; publicKey: string };
    }
  ): Promise<void> {
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    
    try {
      // This would call the WASM bridge to process the prekey bundle
      // and establish a session using X3DH
      // For now, create a placeholder session record
      const placeholderSession = new Uint8Array(1024); // Placeholder
      await sessionState.saveSession(remoteUserId, remoteDeviceId, placeholderSession);
    } finally {
      sessionState.close();
    }
  }

  /**
   * Check if a session exists with a remote device.
   */
  async hasSession(remoteUserId: string, remoteDeviceId: string): Promise<boolean> {
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    try {
      const sessionRecordBytes = await sessionState.loadSession(remoteUserId, remoteDeviceId);
      return sessionRecordBytes !== null;
    } finally {
      sessionState.close();
    }
  }

  /**
   * Get the current session state for debugging.
   */
  async getSessionInfo(remoteUserId: string, remoteDeviceId: string): Promise<{
    exists: boolean;
    sessionId: string;
    lastActivity: number;
  }> {
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    try {
      const sessionRecordBytes = await sessionState.loadSession(remoteUserId, remoteDeviceId);
      return {
        exists: sessionRecordBytes !== null,
        sessionId: signalSessionAddress(remoteUserId, remoteDeviceId),
        lastActivity: Date.now(), // Placeholder
      };
    } finally {
      sessionState.close();
    }
  }

  // Helper methods
  private async deriveMessageKey(chainKey: Uint8Array): Promise<CryptoKey> {
    // In production, this would use proper HKDF with the chain key
    // For now, derive a key from the chain key using Web Crypto
    const salt = new Uint8Array(32); // Zero salt for ratchet
    const info = new TextEncoder().encode("ZipTalk-E2EE-MessageKey-v1");
    
    const baseKey = await crypto.subtle.importKey(
      "raw",
      chainKey as unknown as BufferSource,
      { name: "HKDF" },
      false,
      ["deriveKey"]
    );
    
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        salt: salt as unknown as BufferSource,
        info,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // Helper methods for base64 conversion
  private bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  close(): void {
    this.store.close();
  }
}

/**
 * Convenience function to encrypt a message.
 */
export async function encryptMessage(
  userId: string,
  deviceId: string,
  remoteUserId: string,
  remoteDeviceId: string,
  plaintext: string
): Promise<EncryptedMessage> {
  const manager = await SignalSessionManager.open(userId, deviceId);
  try {
    return await manager.encryptMessage(remoteUserId, remoteDeviceId, plaintext);
  } finally {
    manager.close();
  }
}

/**
 * Convenience function to decrypt a message.
 */
export async function decryptMessage(
  userId: string,
  deviceId: string,
  senderUserId: string,
  senderDeviceId: string,
  ciphertext: string
): Promise<DecryptedMessage> {
  const manager = await SignalSessionManager.open(userId, deviceId);
  try {
    return await manager.decryptMessage(senderUserId, senderDeviceId, ciphertext);
  } finally {
    manager.close();
  }
}
