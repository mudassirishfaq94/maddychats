import { collectRecoveryBundle, validateRecoveryBundle, type RecoveryBundle } from "./device-recovery-file";
export interface RecoveryEnvelope { format: "circlo-cloud-recovery-v1"; kdf: "HKDF-SHA-256"; salt: string; iv: string; ciphertext: string }
export interface RecoveryIdentity { id: string; userId: string; deviceId: string }
export const cloudRecoveryLocalKey = (userId: string, deviceId: string) => `circlo_cloud_recovery_${userId}_${deviceId}`;
const encode = (bytes: Uint8Array) => {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(chunks.join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
const aad = (identity: RecoveryIdentity) => new TextEncoder().encode(`circlo-cloud-recovery-v1:${identity.userId}:${identity.deviceId}:${identity.id}`);
export const newRecoveryCode = () => encode(crypto.getRandomValues(new Uint8Array(32)));
async function wrappingKey(code: string, salt: Uint8Array, identity: RecoveryIdentity) {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(code) || decode(code).length !== 32) throw new Error("Enter the complete saved recovery code, not your account password.");
  const material = await crypto.subtle.importKey("raw", decode(code), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: aad(identity) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function sealRecovery(bundle: RecoveryBundle, code: string, identity: RecoveryIdentity): Promise<RecoveryEnvelope> {
  await validateRecoveryBundle(bundle, identity.userId);
  if (bundle.deviceId !== identity.deviceId) throw new Error("Recovery identity mismatch.");
  const salt = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  if (plaintext.byteLength > 8 * 1024 * 1024) throw new Error("This backup is too large. Keep an encrypted recovery file instead.");
  const key = await wrappingKey(code, salt, identity);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(identity) }, key, plaintext);
  plaintext.fill(0);
  return { format: "circlo-cloud-recovery-v1", kdf: "HKDF-SHA-256", salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
}
export async function openRecovery(envelope: RecoveryEnvelope, code: string, identity: RecoveryIdentity): Promise<RecoveryBundle> {
  try {
    if (envelope.format !== "circlo-cloud-recovery-v1" || envelope.kdf !== "HKDF-SHA-256" || envelope.ciphertext.length > 12 * 1024 * 1024) throw new Error("format");
    const salt = decode(envelope.salt), iv = decode(envelope.iv);
    if (salt.length !== 32 || iv.length !== 12) throw new Error("format");
    const key = await wrappingKey(code.trim(), salt, identity);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad(identity) }, key, decode(envelope.ciphertext)));
    let bundle: RecoveryBundle;
    try { bundle = JSON.parse(new TextDecoder().decode(plaintext)); } finally { plaintext.fill(0); }
    if (bundle!.deviceId !== identity.deviceId) throw new Error("identity");
    await validateRecoveryBundle(bundle!, identity.userId);
    return bundle!;
  } catch { throw new Error("The recovery code is incorrect, this backup belongs to another account, or it is damaged."); }
}
export interface CloudRecoveryConfig { id: string; code: string; revision: number; snapshotDigest?: string }
/** Called away from typing/send work. The code never enters this request. */
export async function refreshCloudRecovery(userId: string, deviceId: string): Promise<boolean> {
  const raw = localStorage.getItem(cloudRecoveryLocalKey(userId, deviceId));
  if (!raw) return false;
  const config = JSON.parse(raw) as CloudRecoveryConfig;
  const identity = { id: config.id, userId, deviceId };
  const bundle = collectRecoveryBundle(userId, deviceId);
  const digest = encode(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(bundle)))));
  if (config.revision>0 && config.snapshotDigest===digest) return true;
  // A response may have been lost after commit. Reconcile only after proving
  // the saved code can decrypt the existing account/device-bound envelope.
  const previous=await fetch(`/api/e2ee/recovery-backups?id=${encodeURIComponent(config.id)}`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(previous.ok) {
    const {backup}=await previous.json();
    const restored=await openRecovery(backup.envelope,config.code,identity);
    for(const [key,value] of Object.entries(restored.keys)) {
      const entries=[...JSON.parse(value),...JSON.parse(bundle.keys[key]??"[]")];
      bundle.keys[key]=JSON.stringify([...new Map(entries.map((entry:{fingerprint:string})=>[entry.fingerprint,entry])).values()]);
    }
    config.revision=backup.revision;
  } else if(previous.status!==404) throw new Error("Recovery status could not be checked. Existing backup was preserved.");
  const envelope = await sealRecovery(bundle, config.code, identity);
  const response = await fetch("/api/e2ee/recovery-backups", { method: "PUT", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ id: config.id, deviceId, revision: config.revision, confirmed: true, envelope }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Recovery backup could not be refreshed.");
  localStorage.setItem(cloudRecoveryLocalKey(userId, deviceId), JSON.stringify({ ...config, revision: result.revision, snapshotDigest: digest }));
  window.dispatchEvent(new Event("circlo:recovery-status"));
  return true;
}
