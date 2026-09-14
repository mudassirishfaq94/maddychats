import "client-only";
import { SignalLocalStore } from "./e2ee-signal-store";

type ByteValue = Uint8Array | number[];
type Prekey = { keyId: number; publicKey: ByteValue; signature?: ByteValue };

/** Minimal, transport-free surface exported by the Signal WASM bridge. */
export interface SignalRegistrationBridge {
  generate_device_registration(oneTimeCount: number): Promise<unknown> | unknown;
}

type Registration = {
  registrationId: number;
  identityKey: ByteValue;
  signingKey: ByteValue;
  signedPrekey: Prekey;
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
    && Boolean(candidate.signedPrekey) && Array.isArray(candidate.oneTimePrekeys)
    && Boolean(candidate.privateIdentity) && Boolean(candidate.privateSignedPrekey) && Array.isArray(candidate.privateOneTimePrekeys);
}

async function publish(deviceId: string, registration: Registration): Promise<void> {
  const response = await fetch("/api/e2ee/signal/devices", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId, registrationId: registration.registrationId,
      identityKey: base64(registration.identityKey), signingKey: base64(registration.signingKey),
      signedPrekey: { keyId: registration.signedPrekey.keyId, publicKey: base64(registration.signedPrekey.publicKey), signature: base64(registration.signedPrekey.signature!) },
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
