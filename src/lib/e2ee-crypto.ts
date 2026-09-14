import "client-only";

/**
 * **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
 * undergone formal security audit. DO NOT use in production without external
 * cryptographic review.
 *
 * **CRITICAL LIMITATIONS:**
 * - Key derivation uses simplified HKDF
 * - No constant-time operations for all comparisons
 * - Session state serialization needs review
 *
 * **REQUIRED BEFORE PRODUCTION:**
 * - Formal security audit
 * - Constant-time comparisons for all sensitive operations
 * - Proper HKDF implementation
 * - Session state verification
 */

// AES-GCM parameters
const AES_GCM_IV_LENGTH = 12; // 96 bits
const AES_GCM_TAG_LENGTH = 128; // 128 bits
const AES_KEY_LENGTH = 256; // 256 bits

// Key derivation info strings
const INFO_MESSAGES = "ZipTalk-E2EE-Messages-v1";
const INFO_SESSION = "ZipTalk-E2EE-Session-v1";
const INFO_MEDIA = "ZipTalk-E2EE-Media-v1";

/**
 * Generate a random AES-GCM key.
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: AES_KEY_LENGTH,
    },
    false, // Not extractable for security
    ["encrypt", "decrypt"]
  );
}

/**
 * Generate a random IV for AES-GCM.
 */
export function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
}

/**
 * Encrypt plaintext using AES-GCM.
 * Returns IV + ciphertext + auth tag.
 */
export async function encryptAESGCM(
  key: CryptoKey,
  plaintext: Uint8Array,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  const iv = generateIV();
  
  const encryptParams: AesGcmParams = {
    name: "AES-GCM",
    iv: iv as unknown as BufferSource,
    tagLength: AES_GCM_TAG_LENGTH,
  };
  
  if (additionalData) {
    encryptParams.additionalData = additionalData as unknown as BufferSource;
  }
  
  const ciphertext = await crypto.subtle.encrypt(
    encryptParams,
    key,
    plaintext as unknown as BufferSource
  );
  
  // Combine IV + ciphertext
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  
  return result;
}

/**
 * Decrypt ciphertext using AES-GCM.
 * Input should be IV + ciphertext + auth tag.
 */
export async function decryptAESGCM(
  key: CryptoKey,
  data: Uint8Array,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  if (data.length < AES_GCM_IV_LENGTH) {
    throw new Error("ciphertext_too_short");
  }
  
  // Extract IV and ciphertext
  const iv = data.slice(0, AES_GCM_IV_LENGTH);
  const ciphertext = data.slice(AES_GCM_IV_LENGTH);
  
  const decryptParams: AesGcmParams = {
    name: "AES-GCM",
    iv: iv as unknown as BufferSource,
    tagLength: AES_GCM_TAG_LENGTH,
  };
  
  if (additionalData) {
    decryptParams.additionalData = additionalData as unknown as BufferSource;
  }
  
  try {
    const plaintext = await crypto.subtle.decrypt(
      decryptParams,
      key,
      ciphertext as unknown as BufferSource
    );
    
    return new Uint8Array(plaintext);
  } catch (error) {
    // Don't reveal specific error details
    throw new Error("decryption_failed");
  }
}

/**
 * Derive a key from a shared secret using HKDF.
 * This is a simplified version - real implementation uses proper HKDF.
 */
export async function deriveKeyFromSecret(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info: string
): Promise<CryptoKey> {
  // Import the shared secret as raw key material
  const baseKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret as unknown as BufferSource,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
  
  // Derive AES-GCM key using HKDF
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: salt as unknown as BufferSource,
      info: new TextEncoder().encode(info),
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
  
  return derivedKey;
}

/**
 * Derive message key from chain key.
 * This implements the Signal ratchet key derivation.
 */
export async function deriveMessageKey(
  chainKey: Uint8Array,
  messageNumber: number
): Promise<CryptoKey> {
  // Create info with message number
  const info = new TextEncoder().encode(`${INFO_MESSAGES}-${messageNumber}`);
  
  // Use HKDF to derive message key
  const salt = new Uint8Array(32); // Zero salt for ratchet
  
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
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Advance the chain key (ratchet step).
 * This implements the Signal ratchet chain advancement.
 */
export async function advanceChainKey(
  chainKey: Uint8Array
): Promise<{ newChainKey: Uint8Array; messageKey: Uint8Array }> {
  // Derive next chain key
  const newChainKey = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      salt: new Uint8Array(32) as unknown as BufferSource,
      info: new TextEncoder().encode(`${INFO_SESSION}-chain`),
      hash: "SHA-256",
    },
    await crypto.subtle.importKey("raw", chainKey as unknown as BufferSource, { name: "HKDF" }, false, ["deriveBits"]),
    256
  );
  
  // Derive message key
  const messageKey = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      salt: new Uint8Array(32) as unknown as BufferSource,
      info: new TextEncoder().encode(`${INFO_MESSAGES}-key`),
      hash: "SHA-256",
    },
    await crypto.subtle.importKey("raw", chainKey as unknown as BufferSource, { name: "HKDF" }, false, ["deriveBits"]),
    256
  );
  
  return {
    newChainKey: new Uint8Array(newChainKey),
    messageKey: new Uint8Array(messageKey),
  };
}

/**
 * Generate a key pair for X3DH key agreement.
 */
export async function generateX3DHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true, // Extractable for key export
    ["deriveKey", "deriveBits"]
  );
}

/**
 * Derive shared secret from X3DH key agreement.
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<Uint8Array> {
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256
  );
  
  return new Uint8Array(sharedSecret);
}

/**
 * Export a CryptoKey to raw bytes.
 */
export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

/**
 * Import raw bytes as a CryptoKey.
 */
export async function importKey(
  raw: Uint8Array,
  extractable: boolean = false
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw as unknown as BufferSource,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    extractable,
    ["encrypt", "decrypt"]
  );
}

/**
 * Securely compare two Uint8Arrays in constant time.
 * This prevents timing attacks.
 */
export function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

/**
 * Clear sensitive data from memory.
 */
export function secureClear(data: Uint8Array): void {
  crypto.getRandomValues(data); // Overwrite with random data
  data.fill(0); // Then zero out
}

/**
 * Encrypt a message for transport.
 * Returns base64-encoded ciphertext.
 */
export async function encryptMessageForTransport(
  key: CryptoKey,
  plaintext: string,
  senderId: string,
  recipientId: string
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  
  // Create additional data for authentication
  const additionalData = encoder.encode(`${senderId}:${recipientId}:${Date.now()}`);
  
  const ciphertext = await encryptAESGCM(key, plaintextBytes, additionalData);
  
  // Convert to base64
  return bytesToBase64(ciphertext);
}

/**
 * Decrypt a message from transport.
 * Input is base64-encoded ciphertext.
 */
export async function decryptMessageFromTransport(
  key: CryptoKey,
  ciphertextBase64: string,
  senderId: string,
  recipientId: string
): Promise<string> {
  const ciphertext = base64ToBytes(ciphertextBase64);
  
  // Create additional data for authentication
  const additionalData = new TextEncoder().encode(`${senderId}:${recipientId}`);
  
  const plaintext = await decryptAESGCM(key, ciphertext, additionalData);
  
  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}

// Helper functions for base64 conversion
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
