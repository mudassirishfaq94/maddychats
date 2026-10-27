/** The registration-only bridge must never be mistaken for a ratchet engine. */
export interface SignalRatchetBridge {
  protocol_version(): number;
  ratchet_adapter_version(): number;
  ratchet_import_registration(registration: Uint8Array, localName: string): Uint8Array;
  ratchet_establish(context: Uint8Array, bundle: Uint8Array): Promise<Uint8Array>;
  ratchet_encrypt(context: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;
  ratchet_decrypt(context: Uint8Array, messageType: number, ciphertext: Uint8Array): Promise<Uint8Array>;
}

export function requireSignalRatchetBridge(value: unknown): SignalRatchetBridge {
  if (!value || typeof value !== "object") throw new Error("signal_ratchet_unavailable");
  const bridge = value as Record<string, unknown>;
  for (const name of ["protocol_version", "ratchet_adapter_version", "ratchet_import_registration", "ratchet_establish", "ratchet_encrypt", "ratchet_decrypt"]) {
    if (typeof bridge[name] !== "function") throw new Error("signal_ratchet_unavailable");
  }
  const candidate = value as SignalRatchetBridge;
  if (candidate.protocol_version() !== 2 || candidate.ratchet_adapter_version() !== 1) throw new Error("signal_ratchet_version_mismatch");
  return candidate;
}
