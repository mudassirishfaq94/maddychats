import { conversationFingerprint, decryptKeyFromSender, decryptPrivateKeyFromStorage, encryptKeyForUser, importPrivateKey, importPublicKey } from "./crypto";

export type RecoveryBundle = { version: 1; userId: string; deviceId: string; keypair: string; secret: string; keys: Record<string, string> };
const MAX_BYTES = 8 * 1024 * 1024;
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, value => String.fromCharCode(value)).join(""));
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
export const recoveryBundleKey = (userId: string) => `e2ee_restored_${userId}`;

export function restoredBundle(userId: string): RecoveryBundle | null {
  const raw = localStorage.getItem(recoveryBundleKey(userId));
  return raw ? JSON.parse(raw) as RecoveryBundle : null;
}

export type StoredChatKey = { fingerprint: string; wrapped: string; historical?: boolean };
export const latestSendingKey = (keys: StoredChatKey[]) => keys.filter(key => !key.historical).at(-1);
export function storedChatKeys(userId: string, storageKey: string): StoredChatKey[] {
  const local = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  const recovered = JSON.parse(restoredBundle(userId)?.keys[storageKey] ?? "[]");
  return [...new Map([...local, ...recovered].map((entry: StoredChatKey) => [entry.fingerprint, entry])).values()];
}

/** Recover history onto the current device without reviving a revoked identity
 * or selecting archived group keys for future sends. All output stays wrapped. */
export async function rewrapRecoveryHistory(bundle: RecoveryBundle, userId: string, recipientPublicKey: string): Promise<Record<string, StoredChatKey[]>> {
  await validateRecoveryBundle(bundle, userId);
  const pair = JSON.parse(bundle.keypair);
  const privateKey = await importPrivateKey(await decryptPrivateKeyFromStorage(pair.encryptedPrivateKey.slice(3), bundle.secret));
  const recipient = await importPublicKey(recipientPublicKey);
  const result: Record<string, StoredChatKey[]> = {};
  for (const [storageKey, raw] of Object.entries(bundle.keys)) {
    const entries: StoredChatKey[] = JSON.parse(raw);
    result[storageKey] = [];
    for (const entry of entries) {
      const key = await decryptKeyFromSender(entry.wrapped, privateKey);
      const fingerprint = await conversationFingerprint(key);
      if (fingerprint !== entry.fingerprint) throw new Error("A recovered chat key is damaged.");
      result[storageKey].push({ fingerprint, wrapped: await encryptKeyForUser(key, recipient), historical: true });
    }
  }
  return result;
}

export function collectRecoveryBundle(userId: string, deviceId: string): RecoveryBundle {
  const previous = restoredBundle(userId);
  const keys = { ...previous?.keys };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(`e2ee_sentkeys_${userId}_`)) keys[key] = JSON.stringify(storedChatKeys(userId, key));
  }
  return { version: 1, userId, deviceId: previous?.deviceId ?? deviceId,
    keypair: previous?.keypair ?? localStorage.getItem(`e2ee_keypair_${userId}`) ?? "",
    secret: previous?.secret ?? localStorage.getItem(`e2ee_recovery_${userId}_${deviceId}`) ?? "", keys };
}

export async function validateRecoveryBundle(bundle: RecoveryBundle, userId: string) {
  if (!bundle || typeof bundle !== "object" || bundle.version !== 1 || bundle.userId !== userId || !/^[a-zA-Z0-9-]{1,100}$/.test(bundle.deviceId) ||
      typeof bundle.secret !== "string" || !/^[a-f0-9]{64}$/.test(bundle.secret) || typeof bundle.keypair !== "string" ||
      !bundle.keys || typeof bundle.keys !== "object" || Array.isArray(bundle.keys)) throw new Error("This recovery file does not belong to the signed-in account or is invalid.");
  for (const [key, value] of Object.entries(bundle.keys)) {
    if (!key.startsWith(`e2ee_sentkeys_${userId}_`) || typeof value !== "string") throw new Error("Invalid chat keys in recovery file.");
    const entries = JSON.parse(value);
    if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.fingerprint !== "string" || typeof entry.wrapped !== "string")) throw new Error("Invalid chat key records.");
  }
  const pair = JSON.parse(bundle.keypair) as { publicKey: string; encryptedPrivateKey: string };
  if (typeof pair.publicKey !== "string" || typeof pair.encryptedPrivateKey !== "string" || !pair.encryptedPrivateKey.startsWith("v2:")) throw new Error("Unsupported encryption backup. Reload the original browser first.");
  const privateKey = await importPrivateKey(await decryptPrivateKeyFromStorage(pair.encryptedPrivateKey.slice(3), bundle.secret));
  const publicKey = await importPublicKey(pair.publicKey);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, challenge);
  const proof = new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encrypted));
  if (!proof.every((byte, i) => byte === challenge[i])) throw new Error("The recovery keys do not match.");
  return pair.publicKey;
}

export async function createRecoveryFile(bundle: RecoveryBundle) {
  await validateRecoveryBundle(bundle, bundle.userId);
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  if (bytes.length > MAX_BYTES) throw new Error("Recovery data is too large to export.");
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("circlo-recovery-v1") }, key, bytes);
  return { code: encode(raw), file: JSON.stringify({ format: "circlo-recovery-v1", iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }) };
}

export async function readRecoveryFile(file: string, code: string, userId: string): Promise<RecoveryBundle> {
  if (file.length > MAX_BYTES * 2) throw new Error("Recovery file is too large.");
  let bundle: RecoveryBundle;
  try {
    const envelope = JSON.parse(file);
    if (envelope.format !== "circlo-recovery-v1") throw new Error("format");
    const raw = decode(code.trim());
    if (raw.length !== 32) throw new Error("code");
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv), additionalData: new TextEncoder().encode("circlo-recovery-v1") }, key, decode(envelope.ciphertext));
    bundle = JSON.parse(new TextDecoder().decode(plain));
  } catch { throw new Error("The recovery code is incorrect or the file is damaged."); }
  await validateRecoveryBundle(bundle, userId);
  return bundle;
}
