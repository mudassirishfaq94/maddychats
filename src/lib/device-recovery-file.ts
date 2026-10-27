import { conversationFingerprint, decryptKeyFromSender, decryptPrivateKeyFromStorage, encryptKeyForUser, importPrivateKey, importPublicKey } from "./crypto";
import { recoveryPhraseFromEntropy, recoveryPhraseToEntropy } from "./recovery-phrase";
import { readDeviceKeyMaterial, removeDeviceKeyMaterial, writeDeviceKeyMaterial } from "./device-key-storage";

export type RecoveryBundle = { version: 1; userId: string; deviceId: string; keypair: string; secret: string; keys: Record<string, string> };
/** Keep the keypair and its recovery secret together when replacing an identity. */
export async function writeRecoveryIdentity(bundle: RecoveryBundle): Promise<void> {
  const keypairKey = `e2ee_keypair_${bundle.userId}`;
  const secretKey = `e2ee_recovery_${bundle.userId}_${bundle.deviceId}`;
  const previousKeypair = await readDeviceKeyMaterial(keypairKey);
  const previousSecret = await readDeviceKeyMaterial(secretKey);
  try {
    await writeDeviceKeyMaterial(keypairKey, bundle.keypair);
    await writeDeviceKeyMaterial(secretKey, bundle.secret);
  } catch (cause) {
    // Attempt both rollbacks even if one storage operation fails again.
    await Promise.allSettled([
      previousKeypair === null ? removeDeviceKeyMaterial(keypairKey) : writeDeviceKeyMaterial(keypairKey, previousKeypair),
      previousSecret === null ? removeDeviceKeyMaterial(secretKey) : writeDeviceKeyMaterial(secretKey, previousSecret),
    ]);
    throw cause;
  }
}

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
  const merged = new Map<string, StoredChatKey>();
  for (const entry of [...local, ...recovered] as StoredChatKey[]) {
    const previous = merged.get(entry.fingerprint);
    if (!previous || (previous.historical && !entry.historical)) merged.set(entry.fingerprint, entry);
  }
  return [...merged.values()];
}

/** Publish the restored archive only after all recovered keys are durable. */
export async function commitRecoveredHistory(userId: string, recovered: Record<string, StoredChatKey[]>, publish: () => Promise<void>, signal: AbortSignal): Promise<void> {
  const previous = new Map<string, string | null>();
  try {
    signal.throwIfAborted();
    for (const [storageKey, entries] of Object.entries(recovered)) {
      const current = storedChatKeys(userId, storageKey), known = new Set(current.map(entry => entry.fingerprint));
      previous.set(storageKey, localStorage.getItem(storageKey));
      localStorage.setItem(storageKey, JSON.stringify([...entries.filter(entry => !known.has(entry.fingerprint)), ...current]));
    }
    signal.throwIfAborted();
    await publish();
  } catch (cause) {
    for (const [storageKey, value] of previous) {
      if (value === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, value);
    }
    throw cause;
  }
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
      if (fingerprint !== entry.fingerprint) throw new Error("Part of this saved chat key is damaged. Try another copy of your file.");
      result[storageKey].push({ fingerprint, wrapped: await encryptKeyForUser(key, recipient), historical: true });
    }
  }
  return result;
}

export async function collectRecoveryBundle(userId: string, deviceId: string): Promise<RecoveryBundle> {
  const previous = restoredBundle(userId);
  const keys = { ...previous?.keys };
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(`e2ee_sentkeys_${userId}_`)) keys[key] = JSON.stringify(storedChatKeys(userId, key));
  }
  const keypairKey = `e2ee_keypair_${userId}`;
  const secretKey = `e2ee_recovery_${userId}_${deviceId}`;
  const keypair = previous?.keypair || await readDeviceKeyMaterial(keypairKey) || "";
  const secret = previous?.secret || await readDeviceKeyMaterial(secretKey) || "";
  if (previous && (previous.keypair || previous.secret)) {
    await writeDeviceKeyMaterial(keypairKey, keypair);
    await writeDeviceKeyMaterial(secretKey, secret);
    localStorage.setItem(recoveryBundleKey(userId), JSON.stringify({ ...previous, keypair: "", secret: "" }));
  }
  return { version: 1, userId, deviceId: previous?.deviceId ?? deviceId, keypair, secret, keys };
}

export async function validateRecoveryBundle(bundle: RecoveryBundle, userId: string) {
  if (!bundle || typeof bundle !== "object" || bundle.version !== 1 || bundle.userId !== userId || !/^[a-zA-Z0-9-]{1,100}$/.test(bundle.deviceId) ||
      typeof bundle.secret !== "string" || !/^[a-f0-9]{64}$/.test(bundle.secret) || typeof bundle.keypair !== "string" ||
      !bundle.keys || typeof bundle.keys !== "object" || Array.isArray(bundle.keys)) throw new Error("This file is damaged or belongs to another account. Sign in to the account it was saved from.");
  for (const [key, value] of Object.entries(bundle.keys)) {
    if (!key.startsWith(`e2ee_sentkeys_${userId}_`) || typeof value !== "string") throw new Error("This recovery file is damaged. Try another copy.");
    const entries = JSON.parse(value);
    if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.fingerprint !== "string" || typeof entry.wrapped !== "string")) throw new Error("This recovery file is damaged. Try another copy.");
  }
  const pair = JSON.parse(bundle.keypair) as { publicKey: string; encryptedPrivateKey: string };
  if (typeof pair.publicKey !== "string" || typeof pair.encryptedPrivateKey !== "string" || !pair.encryptedPrivateKey.startsWith("v2:")) throw new Error("This is an older recovery file. Open Circlo in the original browser and save a new file.");
  const privateKey = await importPrivateKey(await decryptPrivateKeyFromStorage(pair.encryptedPrivateKey.slice(3), bundle.secret));
  const publicKey = await importPublicKey(pair.publicKey);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, challenge);
  const proof = new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encrypted));
  if (!proof.every((byte, i) => byte === challenge[i])) throw new Error("This recovery file could not open its saved chat key. Try another copy.");
  return pair.publicKey;
}

export async function createRecoveryFile(bundle: RecoveryBundle) {
  await validateRecoveryBundle(bundle, bundle.userId);
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  if (bytes.length > MAX_BYTES) throw new Error("There is too much saved chat information for one recovery file. Use a chat backup instead.");
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("circlo-recovery-v1") }, key, bytes);
  return { code: recoveryPhraseFromEntropy(raw), file: JSON.stringify({ format: "circlo-recovery-v1", iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }) };
}

export async function readRecoveryFile(file: string, code: string, userId: string): Promise<RecoveryBundle> {
  if (file.length > MAX_BYTES * 2) throw new Error("Recovery file is too large.");
  let bundle: RecoveryBundle;
  try {
    const envelope = JSON.parse(file);
    if (envelope.format !== "circlo-recovery-v1") throw new Error("format");
    const raw = recoveryPhraseToEntropy(code);
    if (raw.length !== 32) throw new Error("code");
    const key = await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv), additionalData: new TextEncoder().encode("circlo-recovery-v1") }, key, decode(envelope.ciphertext));
    bundle = JSON.parse(new TextDecoder().decode(plain));
  } catch { throw new Error("The recovery words or code do not match this file, or the file is damaged. Check the copy you saved."); }
  await validateRecoveryBundle(bundle, userId);
  return bundle;
}
