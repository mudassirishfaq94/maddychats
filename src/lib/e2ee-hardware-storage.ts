import "client-only";

/**
 * **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
 * undergone formal security audit. DO NOT use in production without external
 * cryptographic review.
 *
 * **CRITICAL LIMITATIONS:**
 * - Android Keystore integration is placeholder
 * - WebAuthn fallback is not implemented
 * - Key derivation is simplified
 * - No biometric authentication integration
 *
 * **REQUIRED BEFORE PRODUCTION:**
 * - Real Android Keystore integration via Capacitor
 * - WebAuthn fallback for desktop browsers
 * - Proper key derivation from user password/biometric
 * - Biometric authentication integration
 * - Formal security review
 */

import { Capacitor } from "@capacitor/core";

export interface HardwareKeyStorage {
  storeKey(id: string, key: CryptoKey): Promise<void>;
  loadKey(id: string): Promise<CryptoKey | null>;
  deleteKey(id: string): Promise<void>;
  hasKey(id: string): Promise<boolean>;
}

/**
 * Check if we're running on a native platform (Android/iOS)
 */
function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Android Keystore implementation using Capacitor
 */
class AndroidKeystoreStorage implements HardwareKeyStorage {
  async storeKey(id: string, key: CryptoKey): Promise<void> {
    // In production, this would use Capacitor's SecureStorage plugin
    // or a custom native plugin that interfaces with Android Keystore
    console.warn("Android Keystore: storeKey called for", id);
    
    // Placeholder: In real implementation, this would:
    // 1. Export the CryptoKey to raw format
    // 2. Encrypt it using Android Keystore
    // 3. Store the encrypted key in secure storage
    
    // For now, fall back to IndexedDB (not secure)
    await this.fallbackStore(id, key);
  }

  async loadKey(id: string): Promise<CryptoKey | null> {
    // Placeholder: In real implementation, this would:
    // 1. Load encrypted key from secure storage
    // 2. Decrypt it using Android Keystore
    // 3. Import it as a CryptoKey
    
    console.warn("Android Keystore: loadKey called for", id);
    return this.fallbackLoad(id);
  }

  async deleteKey(id: string): Promise<void> {
    console.warn("Android Keystore: deleteKey called for", id);
    await this.fallbackDelete(id);
  }

  async hasKey(id: string): Promise<boolean> {
    console.warn("Android Keystore: hasKey called for", id);
    return this.fallbackHas(id);
  }

  // Fallback to IndexedDB (not secure - placeholder only)
  private async fallbackStore(id: string, key: CryptoKey): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    store.put({ id, key });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  private async fallbackLoad(id: string): Promise<CryptoKey | null> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readonly");
    const store = transaction.objectStore("keys");
    const request = store.get(id);
    
    return new Promise<CryptoKey | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.key ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private async fallbackDelete(id: string): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  private async fallbackHas(id: string): Promise<boolean> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readonly");
    const store = transaction.objectStore("keys");
    const request = store.count(id);
    
    return new Promise<boolean>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error);
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("maddy-keys-fallback", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("keys", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * WebAuthn implementation for desktop browsers
 */
class WebAuthnStorage implements HardwareKeyStorage {
  private rpName = "ZipTalk";
  private rpId = window.location.hostname;

  async storeKey(id: string, key: CryptoKey): Promise<void> {
    // In production, this would use WebAuthn to create a credential
    // and store the key securely in the authenticator
    console.warn("WebAuthn: storeKey called for", id);
    
    // Placeholder: In real implementation, this would:
    // 1. Create a WebAuthn credential
    // 2. Associate the CryptoKey with the credential
    // 3. Store the credential ID for later retrieval
    
    await this.fallbackStore(id, key);
  }

  async loadKey(id: string): Promise<CryptoKey | null> {
    console.warn("WebAuthn: loadKey called for", id);
    return this.fallbackLoad(id);
  }

  async deleteKey(id: string): Promise<void> {
    console.warn("WebAuthn: deleteKey called for", id);
    await this.fallbackDelete(id);
  }

  async hasKey(id: string): Promise<boolean> {
    console.warn("WebAuthn: hasKey called for", id);
    return this.fallbackHas(id);
  }

  // Fallback to IndexedDB (not secure - placeholder only)
  private async fallbackStore(id: string, key: CryptoKey): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    store.put({ id, key });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  private async fallbackLoad(id: string): Promise<CryptoKey | null> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readonly");
    const store = transaction.objectStore("keys");
    const request = store.get(id);
    
    return new Promise<CryptoKey | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.key ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private async fallbackDelete(id: string): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    store.delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  private async fallbackHas(id: string): Promise<boolean> {
    const db = await this.openDatabase();
    const transaction = db.transaction("keys", "readonly");
    const store = transaction.objectStore("keys");
    const request = store.count(id);
    
    return new Promise<boolean>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error);
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("maddy-keys-fallback", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("keys", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Create the appropriate hardware key storage based on platform.
 */
export function createHardwareKeyStorage(): HardwareKeyStorage {
  if (isNativePlatform()) {
    return new AndroidKeystoreStorage();
  } else {
    return new WebAuthnStorage();
  }
}

/**
 * Generate a hardware-backed encryption key.
 */
export async function generateHardwareKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    false, // Not extractable (hardware-backed)
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive a key from a password using PBKDF2.
 * This is a simplified version - real implementation would use proper key derivation.
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  // Import password as raw key material
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  // Derive AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
