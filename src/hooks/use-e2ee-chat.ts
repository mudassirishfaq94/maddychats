import { useState, useEffect, useCallback, useRef } from "react";

/**
 * **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
 * undergone formal security audit. DO NOT use in production without external
 * cryptographic review.
 *
 * **CRITICAL LIMITATIONS:**
 * - E2EE is not fully integrated with chat UI
 * - Session establishment is placeholder
 * - No real-time key rotation
 * - Media encryption not implemented
 *
 * **REQUIRED BEFORE PRODUCTION:**
 * - Complete X3DH integration
 * - Real-time key rotation
 * - Media encryption
 * - Formal security review
 */

import { SignalSessionManager, EncryptedMessage, DecryptedMessage } from "../lib/e2ee-signal-session-manager";
import { X3DHSessionManager, PreKeyBundle, X3DHSession } from "../lib/e2ee-x3dh";
import { getCachedSession, cacheSession } from "../lib/e2ee-performance";

export interface E2EEChatState {
  isEncrypted: boolean;
  sessionEstablished: boolean;
  encryptionEnabled: boolean;
  lastError: string | null;
}

export interface E2EEChatActions {
  encryptMessage: (plaintext: string, recipientUserId: string, recipientDeviceId: string) => Promise<EncryptedMessage>;
  decryptMessage: (ciphertext: string, senderUserId: string, senderDeviceId: string) => Promise<DecryptedMessage>;
  establishSession: (remoteUserId: string, remoteDeviceId: string, prekeyBundle: PreKeyBundle) => Promise<X3DHSession>;
  checkSession: (remoteUserId: string, remoteDeviceId: string) => Promise<boolean>;
  getEncryptionStatus: () => E2EEChatState;
}

/**
 * Hook for E2EE chat functionality.
 * Provides encryption/decryption for real-time messaging.
 */
export function useE2EEChat(
  userId: string,
  deviceId: string
): E2EEChatActions & E2EEChatState {
  const [state, setState] = useState<E2EEChatState>({
    isEncrypted: false,
    sessionEstablished: false,
    encryptionEnabled: true,
    lastError: null,
  });

  const sessionManagerRef = useRef<SignalSessionManager | null>(null);
  const x3dhManagerRef = useRef<X3DHSessionManager | null>(null);

  // Initialize managers on mount
  useEffect(() => {
    const initializeManagers = async () => {
      try {
        sessionManagerRef.current = await SignalSessionManager.open(userId, deviceId);
        x3dhManagerRef.current = await X3DHSessionManager.open(userId, deviceId);
        setState(prev => ({ ...prev, isEncrypted: true }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          lastError: error instanceof Error ? error.message : "Failed to initialize E2EE",
        }));
      }
    };

    initializeManagers();

    return () => {
      sessionManagerRef.current?.close();
      x3dhManagerRef.current?.close();
    };
  }, [userId, deviceId]);

  /**
   * Encrypt a message for a recipient.
   */
  const encryptMessage = useCallback(
    async (
      plaintext: string,
      recipientUserId: string,
      recipientDeviceId: string
    ): Promise<EncryptedMessage> => {
      if (!sessionManagerRef.current) {
        throw new Error("E2EE not initialized");
      }

      try {
        // Check if session exists
        const hasSession = await sessionManagerRef.current.hasSession(
          recipientUserId,
          recipientDeviceId
        );

        if (!hasSession) {
          throw new Error("no_session_established");
        }

        // Encrypt the message
        const encrypted = await sessionManagerRef.current.encryptMessage(
          recipientUserId,
          recipientDeviceId,
          plaintext
        );

        return encrypted;
      } catch (error) {
        setState(prev => ({
          ...prev,
          lastError: error instanceof Error ? error.message : "Encryption failed",
        }));
        throw error;
      }
    },
    []
  );

  /**
   * Decrypt a message from a sender.
   */
  const decryptMessage = useCallback(
    async (
      ciphertext: string,
      senderUserId: string,
      senderDeviceId: string
    ): Promise<DecryptedMessage> => {
      if (!sessionManagerRef.current) {
        throw new Error("E2EE not initialized");
      }

      try {
        // Check if session exists
        const hasSession = await sessionManagerRef.current.hasSession(
          senderUserId,
          senderDeviceId
        );

        if (!hasSession) {
          throw new Error("no_session_established");
        }

        // Decrypt the message
        const decrypted = await sessionManagerRef.current.decryptMessage(
          senderUserId,
          senderDeviceId,
          ciphertext
        );

        return decrypted;
      } catch (error) {
        setState(prev => ({
          ...prev,
          lastError: error instanceof Error ? error.message : "Decryption failed",
        }));
        throw error;
      }
    },
    []
  );

  /**
   * Establish a session with a remote device.
   */
  const establishSession = useCallback(
    async (
      remoteUserId: string,
      remoteDeviceId: string,
      prekeyBundle: PreKeyBundle
    ): Promise<X3DHSession> => {
      if (!x3dhManagerRef.current) {
        throw new Error("E2EE not initialized");
      }

      try {
        const session = await x3dhManagerRef.current.createSession(
          remoteUserId,
          remoteDeviceId,
          prekeyBundle
        );

        setState(prev => ({
          ...prev,
          sessionEstablished: true,
        }));

        return session;
      } catch (error) {
        setState(prev => ({
          ...prev,
          lastError: error instanceof Error ? error.message : "Session establishment failed",
        }));
        throw error;
      }
    },
    []
  );

  /**
   * Check if a session exists with a remote device.
   */
  const checkSession = useCallback(
    async (remoteUserId: string, remoteDeviceId: string): Promise<boolean> => {
      if (!x3dhManagerRef.current) {
        return false;
      }

      try {
        return await x3dhManagerRef.current.hasSession(remoteUserId, remoteDeviceId);
      } catch (error) {
        return false;
      }
    },
    []
  );

  /**
   * Get current encryption status.
   */
  const getEncryptionStatus = useCallback((): E2EEChatState => {
    return state;
  }, [state]);

  return {
    ...state,
    encryptMessage,
    decryptMessage,
    establishSession,
    checkSession,
    getEncryptionStatus,
  };
}

/**
 * Hook for checking E2EE status in a conversation.
 */
export function useE2EEStatus(
  userId: string,
  deviceId: string,
  remoteUserId: string,
  remoteDeviceId: string
) {
  const [status, setStatus] = useState<{
    hasSession: boolean;
    isVerified: boolean;
    lastActivity: number | null;
  }>({
    hasSession: false,
    isVerified: false,
    lastActivity: null,
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const manager = await X3DHSessionManager.open(userId, deviceId);
        try {
          const hasSession = await manager.hasSession(remoteUserId, remoteDeviceId);
          const verification = hasSession
            ? await manager.verifySession(remoteUserId, remoteDeviceId)
            : { valid: false };

          setStatus({
            hasSession,
            isVerified: verification.valid,
            lastActivity: hasSession ? Date.now() : null,
          });
        } finally {
          manager.close();
        }
      } catch (error) {
        console.error("Failed to check E2EE status:", error);
      }
    };

    checkStatus();
  }, [userId, deviceId, remoteUserId, remoteDeviceId]);

  return status;
}
