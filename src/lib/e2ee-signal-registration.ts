import "client-only";
import { SignalLocalStore } from "./e2ee-signal-store";

type ByteValue = Uint8Array | number[];
type Prekey = { keyId: number; publicKey: ByteValue; signature?: ByteValue };

/** Minimal, transport-free surface exported by the Signal WASM bridge. */
export interface SignalRegistrationBridge {
  generate_device_registration(oneTimeCount: number): Promise<unknown> | unknown;
  generate_one_time_prekeys?(count: number): Promise<unknown> | unknown;
}

type Registration = {
  registrationId: number;
  identityKey: ByteValue;
  signingKey: ByteValue;
  signedPrekey: Prekey;
  kyberPrekey: Prekey;
  oneTimePrekeys: Prekey[];
  privateIdentity: ByteValue;
  privateSignedPrekey: { keyId: number; privateKey: ByteValue };
  privateOneTimePrekeys: Array<{ keyId: number; privateKey: ByteValue }>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NAMESPACE = "signal-registration-v2";

function bytes(value: ByteValue): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function base64(value: ByteValue): string {
  const input = bytes(value);
  let binary = "";
  for (let offset = 0; offset < input.length; offset += 0x8000) binary += String.fromCharCode(...input.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function isRegistration(value: unknown): value is Registration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<Registration>;
  return Number.isInteger(candidate.registrationId) && Boolean(candidate.identityKey) && Boolean(candidate.signingKey)
    && Boolean(candidate.signedPrekey) && Boolean(candidate.kyberPrekey) && Array.isArray(candidate.oneTimePrekeys)
    && Boolean(candidate.privateIdentity) && Boolean(candidate.privateSignedPrekey) && Array.isArray(candidate.privateOneTimePrekeys);
}

async function publish(deviceId: string, registration: Registration): Promise<void> {
  const response = await fetch("/api/e2ee/signal/devices", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId, registrationId: registration.registrationId,
      identityKey: base64(registration.identityKey), signingKey: base64(registration.signingKey),
      signedPrekey: { keyId: registration.signedPrekey.keyId, publicKey: base64(registration.signedPrekey.publicKey), signature: base64(registration.signedPrekey.signature!) },
      kyberPrekey: { keyId: registration.kyberPrekey.keyId, publicKey: base64(registration.kyberPrekey.publicKey), signature: base64(registration.kyberPrekey.signature!) },
      oneTimePrekeys: registration.oneTimePrekeys.map((key) => ({ keyId: key.keyId, publicKey: base64(key.publicKey) })),
    }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "signal_device_registration_failed");
}

/**
 * Persist private material before registration, so a network retry cannot
 * create a second device identity. Existing local material is re-published
 * idempotently instead of regenerated.
 */
export async function ensureSignalDeviceRegistered(
  userId: string, deviceId: string, bridge: SignalRegistrationBridge,
): Promise<{ created: boolean }> {
  const store = await SignalLocalStore.open();
  try {
    const saved = await store.loadBytes(NAMESPACE, userId, deviceId);
    if (saved) {
      const registration: unknown = JSON.parse(decoder.decode(saved));
      if (!isRegistration(registration)) throw new Error("signal_local_registration_invalid");
      await publish(deviceId, registration);
      return { created: false };
    }
    const generated = await bridge.generate_device_registration(100);
    if (!isRegistration(generated)) throw new Error("signal_bridge_registration_invalid");
    await store.saveBytes(NAMESPACE, userId, deviceId, encoder.encode(JSON.stringify(generated)));
    await publish(deviceId, generated);
    return { created: true };
  } finally {
    store.close();
  }
}

/** Append replacement one-time prekeys without ever rotating device identity. */
export async function refillSignalOneTimePrekeys(
  userId: string, deviceId: string, bridge: SignalRegistrationBridge, count = 100,
): Promise<void> {
  if (!bridge.generate_one_time_prekeys) throw new Error("signal_bridge_prekey_refill_unavailable");
  const store = await SignalLocalStore.open();
  try {
    const saved = await store.loadBytes(NAMESPACE, userId, deviceId);
    if (!saved) throw new Error("signal_local_registration_missing");
    const registration: unknown = JSON.parse(decoder.decode(saved));
    if (!isRegistration(registration)) throw new Error("signal_local_registration_invalid");
    const generated = await bridge.generate_one_time_prekeys(count) as { oneTimePrekeys?: Prekey[]; privateOneTimePrekeys?: Array<{ keyId: number; privateKey: ByteValue }> };
    if (!Array.isArray(generated.oneTimePrekeys) || !Array.isArray(generated.privateOneTimePrekeys)) throw new Error("signal_bridge_prekey_refill_invalid");
    registration.oneTimePrekeys.push(...generated.oneTimePrekeys);
    registration.privateOneTimePrekeys.push(...generated.privateOneTimePrekeys);
    await store.saveBytes(NAMESPACE, userId, deviceId, encoder.encode(JSON.stringify(registration)));
    await publish(deviceId, registration);
  } finally { store.close(); }
}

/** Keep an offline-session reserve without generating keys on every launch. */
export async function maintainSignalPrekeyReserve(
  userId: string, deviceId: string, bridge: SignalRegistrationBridge, minimum = 25,
): Promise<{ refilled: boolean }> {
  const response = await fetch("/api/e2ee/signal/devices", { cache: "no-store" });
  if (!response.ok) throw new Error("signal_prekey_inventory_failed");
  const data = await response.json() as { devices?: Array<{ deviceId?: string; oneTimePrekeys?: number }> };
  const device = data.devices?.find((item) => item.deviceId === deviceId);
  if (!device) throw new Error("signal_device_not_registered");
  if ((device.oneTimePrekeys ?? 0) >= minimum) return { refilled: false };
  await refillSignalOneTimePrekeys(userId, deviceId, bridge);
  return { refilled: true };
}
