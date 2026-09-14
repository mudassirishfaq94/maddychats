import "client-only";

/**
 * **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
 * undergone formal security audit. DO NOT use in production without external
 * cryptographic review.
 *
 * **CRITICAL LIMITATIONS:**
 * - X3DH session establishment is simplified
 * - No proper Kyber PQ integration yet
 * - Session verification is placeholder
 * - Trust-on-first-use only
 *
 * **REQUIRED BEFORE PRODUCTION:**
 * - Complete X3DH with Kyber PQ
 * - Session verification UI
 * - Key trust establishment
 * - Formal security review
 */

import { loadSignalBridge } from "./e2ee-signal-bridge";
import { SignalLocalStore } from "./e2ee-signal-store";
import { SignalSessionState } from "./e2ee-signal-session-state";
import { generateAESKey, exportKey, importKey } from "./e2ee-crypto";

const X3DH_NAMESPACE = "signal-x3dh-v1";
const DEVICE_NAMESPACE = "signal-device-v1";

export interface PreKeyBundle {
  deviceId: string;
  protocolDeviceId: number;
  registrationId: number;
  identityKey: string; // Base64
  signedPrekey: {
    keyId: number;
    publicKey: string; // Base64
    signature: string; // Base64
  };
  kyberPrekey: {
    keyId: number;
    publicKey: string; // Base64
    signature: string; // Base64
  };
  oneTimePrekey?: {
    keyId: number;
    publicKey: string; // Base64
  };
}

export interface X3DHSession {
  sessionId: string;
  remoteUserId: string;
  remoteDeviceId: string;
  sessionRecord: Uint8Array;
  createdAt: number;
  lastActivity: number;
}

/**
 * X3DH Session Establishment Manager.
 * Handles asynchronous key agreement for Signal Protocol sessions.
 */
export class X3DHSessionManager {
  private store: SignalLocalStore;
  private userId: string;
  private deviceId: string;

  private constructor(store: SignalLocalStore, userId: string, deviceId: string) {
    this.store = store;
    this.userId = userId;
    this.deviceId = deviceId;
  }

  static async open(userId: string, deviceId: string): Promise<X3DHSessionManager> {
    const store = await SignalLocalStore.open();
    return new X3DHSessionManager(store, userId, deviceId);
  }

  /**
   * Create a new session with a remote device using their prekey bundle.
   * This is Alice's side of X3DH.
   */
  async createSession(
    remoteUserId: string,
    remoteDeviceId: string,
    prekeyBundle: PreKeyBundle
  ): Promise<X3DHSession> {
    const bridge = await loadSignalBridge();

    // Load our identity key
    const identityBytes = await this.loadIdentity();
    if (!identityBytes) {
      throw new Error("no_identity_registered");
    }

    // Convert prekey bundle to bytes for WASM
    const bundleBytes = new TextEncoder().encode(JSON.stringify({
      identityKey: this.base64ToBytes(prekeyBundle.identityKey),
      signedPrekeyId: prekeyBundle.signedPrekey.keyId,
      signedPrekeyPublic: this.base64ToBytes(prekeyBundle.signedPrekey.publicKey),
      signedPrekeySignature: this.base64ToBytes(prekeyBundle.signedPrekey.signature),
      kyberPrekeyId: prekeyBundle.kyberPrekey.keyId,
      kyberPrekeyPublic: this.base64ToBytes(prekeyBundle.kyberPrekey.publicKey),
      kyberPrekeySignature: this.base64ToBytes(prekeyBundle.kyberPrekey.signature),
      oneTimePrekeyId: prekeyBundle.oneTimePrekey?.keyId,
      oneTimePrekeyPublic: prekeyBundle.oneTimePrekey ? this.base64ToBytes(prekeyBundle.oneTimePrekey.publicKey) : null,
    }));

    // Create X3DH session using WASM bridge
    const resultBytes = await bridge.create_x3dh_session(identityBytes, bundleBytes);
    const result = JSON.parse(new TextDecoder().decode(resultBytes));

    // Create session record
    const session: X3DHSession = {
      sessionId: `${remoteUserId}:${remoteDeviceId}`,
      remoteUserId,
      remoteDeviceId,
      sessionRecord: new Uint8Array(result.sessionRecord),
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    // Save session to local storage
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    try {
      await sessionState.saveSession(
        remoteUserId,
        remoteDeviceId,
        session.sessionRecord
      );
    } finally {
      sessionState.close();
    }

    return session;
  }

  /**
   * Process an initial X3DH message from a remote device.
   * This is Bob's side of X3DH.
   */
  async processInitialMessage(
    remoteUserId: string,
    remoteDeviceId: string,
    aliceIdentityKey: string,
    initialMessage: string
  ): Promise<X3DHSession> {
    const bridge = await loadSignalBridge();

    // Load our identity and prekeys
    const identityBytes = await this.loadIdentity();
    const signedPrekeyBytes = await this.loadSignedPrekey();
    const kyberPrekeyBytes = await this.loadKyberPrekey();

    if (!identityBytes || !signedPrekeyBytes || !kyberPrekeyBytes) {
      throw new Error("missing_identity_or_prekeys");
    }

    // Convert inputs to bytes
    const aliceIdentityBytes = this.base64ToBytes(aliceIdentityKey);
    const initialMessageBytes = this.base64ToBytes(initialMessage);

    // Process X3DH initial message using WASM bridge
    const sessionRecordBytes = await bridge.process_x3dh_initial_message(
      identityBytes,
      signedPrekeyBytes,
      kyberPrekeyBytes,
      aliceIdentityBytes,
      initialMessageBytes
    );

    // Create session record
    const session: X3DHSession = {
      sessionId: `${remoteUserId}:${remoteDeviceId}`,
      remoteUserId,
      remoteDeviceId,
      sessionRecord: new Uint8Array(sessionRecordBytes),
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    // Save session to local storage
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    try {
      await sessionState.saveSession(
        remoteUserId,
        remoteDeviceId,
        session.sessionRecord
      );
    } finally {
      sessionState.close();
    }

    return session;
  }

  /**
   * Get an existing session with a remote device.
   */
  async getSession(
    remoteUserId: string,
    remoteDeviceId: string
  ): Promise<X3DHSession | null> {
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    try {
      const sessionRecordBytes = await sessionState.loadSession(
        remoteUserId,
        remoteDeviceId
      );

      if (!sessionRecordBytes) {
        return null;
      }

      return {
        sessionId: `${remoteUserId}:${remoteDeviceId}`,
        remoteUserId,
        remoteDeviceId,
        sessionRecord: sessionRecordBytes,
        createdAt: Date.now(), // Would be stored in session
        lastActivity: Date.now(), // Would be stored in session
      };
    } finally {
      sessionState.close();
    }
  }

  /**
   * Check if a session exists with a remote device.
   */
  async hasSession(
    remoteUserId: string,
    remoteDeviceId: string
  ): Promise<boolean> {
    const session = await this.getSession(remoteUserId, remoteDeviceId);
    return session !== null;
  }

  /**
   * Verify a session record is valid.
   */
  async verifySession(
    remoteUserId: string,
    remoteDeviceId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const bridge = await loadSignalBridge();
    const session = await this.getSession(remoteUserId, remoteDeviceId);

    if (!session) {
      return { valid: false, reason: "no_session" };
    }

    try {
      const isValid = await bridge.verify_session_record(session.sessionRecord);
      return { valid: isValid, reason: isValid ? undefined : "invalid_session" };
    } catch (error) {
      return { valid: false, reason: "verification_error" };
    }
  }

  /**
   * Get all active sessions.
   */
  async getActiveSessions(): Promise<X3DHSession[]> {
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    try {
      // This would need to iterate over all stored sessions
      // For now, return empty array
      return [];
    } finally {
      sessionState.close();
    }
  }

  /**
   * Delete a session with a remote device.
   */
  async deleteSession(
    remoteUserId: string,
    remoteDeviceId: string
  ): Promise<void> {
    const sessionState = await SignalSessionState.open(this.userId, this.deviceId);
    try {
      // Remove session from storage
      // This would need to be implemented in SignalSessionState
    } finally {
      sessionState.close();
    }
  }

  // Private helper methods
  private async loadIdentity(): Promise<Uint8Array | null> {
    const stored = await this.store.loadBytes(
      DEVICE_NAMESPACE,
      this.userId,
      this.deviceId
    );
    if (!stored) return null;

    const deviceInfo = JSON.parse(new TextDecoder().decode(stored));
    return this.base64ToBytes(deviceInfo.identityKey);
  }

  private async loadSignedPrekey(): Promise<Uint8Array | null> {
    const stored = await this.store.loadBytes(
      DEVICE_NAMESPACE,
      this.userId,
      this.deviceId
    );
    if (!stored) return null;

    const deviceInfo = JSON.parse(new TextDecoder().decode(stored));
    return this.base64ToBytes(deviceInfo.privateSignedPrekey);
  }

  private async loadKyberPrekey(): Promise<Uint8Array | null> {
    const stored = await this.store.loadBytes(
      DEVICE_NAMESPACE,
      this.userId,
      this.deviceId
    );
    if (!stored) return null;

    const deviceInfo = JSON.parse(new TextDecoder().decode(stored));
    return this.base64ToBytes(deviceInfo.privateKyberPrekey);
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  close(): void {
    this.store.close();
  }
}

/**
 * Convenience function to create an X3DH session.
 */
export async function createX3DHSession(
  userId: string,
  deviceId: string,
  remoteUserId: string,
  remoteDeviceId: string,
  prekeyBundle: PreKeyBundle
): Promise<X3DHSession> {
  const manager = await X3DHSessionManager.open(userId, deviceId);
  try {
    return await manager.createSession(remoteUserId, remoteDeviceId, prekeyBundle);
  } finally {
    manager.close();
  }
}

/**
 * Convenience function to check if X3DH session exists.
 */
export async function hasX3DHSession(
  userId: string,
  deviceId: string,
  remoteUserId: string,
  remoteDeviceId: string
): Promise<boolean> {
  const manager = await X3DHSessionManager.open(userId, deviceId);
  try {
    return await manager.hasSession(remoteUserId, remoteDeviceId);
  } finally {
    manager.close();
  }
}
