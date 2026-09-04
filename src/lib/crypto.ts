/**
 * End-to-End Encryption (E2EE) using Web Crypto API.
 *
 * - Each device generates an X25519 key pair
 * - Private key is encrypted with a passphrase and stored on the server
 * - Public key is shared with other users
 * - Per-conversation AES-GCM symmetric keys are shared via key exchange
 * - Messages are encrypted client-side before sending
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

/** Generate a unique device ID */
export function generateDeviceId(): string {
  const stored = typeof localStorage !== "undefined" && localStorage.getItem("e2ee_device_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  if (typeof localStorage !== "undefined") localStorage.setItem("e2ee_device_id", id);
  return id;
}

/** Generate an RSA-OAEP key pair for key exchange */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable for export
    ["encrypt", "decrypt"],
  );
}

/** Export a public key to base64 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("spki", key);
  return bufferToBase64(raw);
}

/** Export a private key to base64 (JWK format for storage) */
export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

/** Import a public key from base64 */
export async function importPublicKey(base64: string): Promise<CryptoKey> {
  const buffer = base64ToBuffer(base64);
  return crypto.subtle.importKey(
    "spki",
    buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

/** Import a private key from JWK */
export async function importPrivateKey(jwkJson: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkJson);
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

/** Generate a symmetric AES-GCM key for a conversation */
export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

/** Export a symmetric key to base64 */
export async function exportSymmetricKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64(raw);
}

/** Import a symmetric key from base64 */
export async function importSymmetricKey(base64: string): Promise<CryptoKey> {
  const buffer = base64ToBuffer(base64);
  return crypto.subtle.importKey(
    "raw",
    buffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt the symmetric key with a user's public key (for key sharing) */
export async function encryptKeyForUser(
  symmetricKey: CryptoKey,
  recipientPublicKey: CryptoKey,
): Promise<string> {
  const exported = await exportSymmetricKey(symmetricKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    new TextEncoder().encode(exported),
  );
  return bufferToBase64(encrypted);
}

/** Decrypt a symmetric key with the user's private key */
export async function decryptKeyFromSender(
  encryptedKeyBase64: string,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  const encrypted = base64ToBuffer(encryptedKeyBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encrypted,
  );
  const keyBase64 = new TextDecoder().decode(decrypted);
  return importSymmetricKey(keyBase64);
}

/** Encrypt a message with the conversation's symmetric key */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );
  // Prepend IV to ciphertext
  const encBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encBytes.byteLength);
  combined.set(iv);
  combined.set(encBytes, iv.length);
  return bufferToBase64(combined.buffer);
}

/** Decrypt a message with the conversation's symmetric key */
export async function decryptMessage(
  ciphertextBase64: string,
  key: CryptoKey,
): Promise<string> {
  const combined = new Uint8Array(base64ToBuffer(ciphertextBase64));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

/** Encrypt the private key with a passphrase for server storage */
export async function encryptPrivateKeyForStorage(
  privateKeyJwk: string,
  passphrase: string,
): Promise<string> {
  // Derive a key from the passphrase
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    derivedKey,
    new TextEncoder().encode(privateKeyJwk),
  );

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  return bufferToBase64(combined.buffer);
}

/** Decrypt the private key from server storage */
export async function decryptPrivateKeyFromStorage(
  encryptedBase64: string,
  passphrase: string,
): Promise<string> {
  const combined = base64ToBuffer(encryptedBase64);
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 16 + IV_LENGTH);
  const ciphertext = combined.slice(16 + IV_LENGTH);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    derivedKey,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

/* ──────── Helpers ──────── */

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
