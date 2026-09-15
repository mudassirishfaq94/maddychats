import "client-only";

/**
 * **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
 * undergone formal security audit. DO NOT use in production without external
 * cryptographic review.
 *
 * Media encryption module for images, voice messages, and files.
 * Encrypts media before upload and decrypts after download.
 */

import { encryptAESGCM, decryptAESGCM, generateAESKey, exportKey, importKey } from "./e2ee-crypto";

const MEDIA_KEY_NAMESPACE = "e2ee-media-keys";

export interface EncryptedMedia {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  key: CryptoKey;
  mimeType: string;
  originalName: string;
}

export interface EncryptedMediaUpload {
  file: File; // Encrypted file
  wrappedKey: string; // Base64-encoded conversation-wrapped media key
  originalMime: string;
  iv: string; // Base64-encoded IV
}

export interface DecryptedMedia {
  data: ArrayBuffer;
  mimeType: string;
  originalName: string;
}

/**
 * Media encryption manager.
 * Handles encryption/decryption of media files for secure storage.
 */
export class MediaEncryptionManager {
  private keyCache: Map<string, CryptoKey> = new Map();

  /**
   * Encrypt a file for secure upload.
   * Returns encrypted file + wrapped key for the recipient.
   */
  async encryptFile(
    file: File,
    conversationKey: CryptoKey
  ): Promise<EncryptedMediaUpload> {
    // Generate a unique media key
    const mediaKey = await generateAESKey();
    const mediaKeyRaw = await exportKey(mediaKey);
    
    // Read file content
    const fileBuffer = await file.arrayBuffer();
    const plaintext = new Uint8Array(fileBuffer);
    
    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt file content
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      mediaKey,
      plaintext as unknown as BufferSource
    );
    
    // Wrap media key with conversation key
    const wrappedKey = await this.wrapKey(mediaKey, conversationKey);
    
    // Create encrypted file
    const encryptedBuffer = new Uint8Array(iv.length + ciphertext.byteLength);
    encryptedBuffer.set(iv, 0);
    encryptedBuffer.set(new Uint8Array(ciphertext), iv.length);
    
    const encryptedFile = new File(
      [encryptedBuffer],
      `${file.name}.enc`,
      { type: "application/octet-stream" }
    );
    
    return {
      file: encryptedFile,
      wrappedKey,
      originalMime: file.type || "application/octet-stream",
      iv: this.bytesToBase64(iv),
    };
  }

  /**
   * Encrypt raw bytes for secure storage.
   */
  async encryptBytes(
    data: Uint8Array,
    conversationKey: CryptoKey
  ): Promise<{ ciphertext: string; wrappedKey: string; iv: string }> {
    // Generate a unique media key
    const mediaKey = await generateAESKey();
    
    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt data
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      mediaKey,
      data as unknown as BufferSource
    );
    
    // Wrap media key with conversation key
    const wrappedKey = await this.wrapKey(mediaKey, conversationKey);
    
    return {
      ciphertext: this.bytesToBase64(new Uint8Array(ciphertext)),
      wrappedKey,
      iv: this.bytesToBase64(iv),
    };
  }

  /**
   * Decrypt an encrypted file after download.
   */
  async decryptFile(
    encryptedData: ArrayBuffer,
    wrappedKey: string,
    iv: string,
    conversationKey: CryptoKey,
    originalMime: string,
    originalName: string
  ): Promise<DecryptedMedia> {
    // Unwrap media key
    const mediaKey = await this.unwrapKey(wrappedKey, conversationKey);
    
    // Parse IV
    const ivBytes = this.base64ToBytes(iv);
    
    // Decrypt data
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes as BufferSource },
      mediaKey,
      encryptedData
    );
    
    return {
      data: plaintext,
      mimeType: originalMime,
      originalName,
    };
  }

  /**
   * Decrypt raw bytes from secure storage.
   */
  async decryptBytes(
    ciphertext: string,
    wrappedKey: string,
    iv: string,
    conversationKey: CryptoKey
  ): Promise<Uint8Array> {
    // Unwrap media key
    const mediaKey = await this.unwrapKey(wrappedKey, conversationKey);
    
    // Parse IV and ciphertext
    const ivBytes = this.base64ToBytes(iv);
    const ciphertextBytes = this.base64ToBytes(ciphertext);
    
    // Decrypt data
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes as BufferSource },
      mediaKey,
      ciphertextBytes as unknown as BufferSource
    );
    
    return new Uint8Array(plaintext);
  }

  /**
   * Wrap a media key with the conversation key.
   */
  private async wrapKey(
    mediaKey: CryptoKey,
    conversationKey: CryptoKey
  ): Promise<string> {
    // Wrap with AES-KW (Key Wrap)
    const wrapped = await crypto.subtle.wrapKey(
      "raw",
      mediaKey,
      conversationKey,
      { name: "AES-KW" }
    );
    
    return this.bytesToBase64(new Uint8Array(wrapped));
  }

  /**
   * Unwrap a media key with the conversation key.
   */
  private async unwrapKey(
    wrappedKey: string,
    conversationKey: CryptoKey
  ): Promise<CryptoKey> {
    const wrappedBytes = this.base64ToBytes(wrappedKey);
    
    const unwrapped = await crypto.subtle.unwrapKey(
      "raw",
      wrappedBytes as unknown as BufferSource,
      conversationKey,
      { name: "AES-KW" },
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    
    return unwrapped;
  }

  // Helper functions

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
}

/**
 * Create a media encryption manager.
 */
export function createMediaEncryptionManager(): MediaEncryptionManager {
  return new MediaEncryptionManager();
}
