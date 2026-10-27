import "client-only";

/**
 * Existing registration bridge. The shipped assets at /signal/ provide
 * registration; the legacy session signatures below are disabled scaffolding,
 * not evidence of working Double Ratchet message protection.
 *
 * New official-libsignal operations use signal-ratchet-loader.ts and separate
 * versioned assets. Production sending remains on the existing encrypted path.
 */

import type { SignalRegistrationBridge } from "./e2ee-signal-registration";

type SignalWasmModule = SignalRegistrationBridge & {
  protocol_version(): number;
  encrypt_message(sessionRecordBytes: Uint8Array, plaintext: Uint8Array): Uint8Array;
  decrypt_message(sessionRecordBytes: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  get_sender_chain_key(sessionRecordBytes: Uint8Array): Uint8Array;
  get_receiver_chain_key(sessionRecordBytes: Uint8Array): Uint8Array;
  advance_sender_chain(sessionRecordBytes: Uint8Array): Uint8Array;
  advance_receiver_chain(sessionRecordBytes: Uint8Array): Uint8Array;
  verify_message_signature(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
  // X3DH functions
  create_x3dh_session(aliceIdentityBytes: Uint8Array, bobBundleBytes: Uint8Array): Uint8Array;
  process_x3dh_initial_message(
    bobIdentityBytes: Uint8Array,
    bobSignedPrekeyBytes: Uint8Array,
    bobKyberPrekeyBytes: Uint8Array,
    aliceIdentityBytes: Uint8Array,
    aliceInitialMessageBytes: Uint8Array
  ): Uint8Array;
  verify_session_record(sessionBytes: Uint8Array): boolean;
  get_session_chain_keys(sessionBytes: Uint8Array): Uint8Array;
};

let bridgePromise: Promise<SignalWasmModule> | null = null;

/**
 * Load the pinned Signal protocol bridge from same-origin static assets.
 *
 * The `web` wasm-bindgen target uses a relative fetch for its `.wasm` file,
 * so importing the JavaScript module by its absolute public URL works in both
 * a desktop browser and Capacitor's Android WebView. Nothing is loaded on the
 * server, and private protocol state remains in SignalLocalStore.
 */
export function loadSignalBridge(): Promise<SignalWasmModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("signal_bridge_requires_browser"));
  if (!bridgePromise) {
    bridgePromise = (async () => {
      const url = new URL("/signal/maddy_signal_bridge.js", window.location.origin).href;
      const bridgeModule = await import(/* webpackIgnore: true */ url) as SignalWasmModule & { default: () => Promise<unknown> };
      await bridgeModule.default();
      if (bridgeModule.protocol_version() !== 2) throw new Error("signal_bridge_protocol_mismatch");
      return bridgeModule;
    })().catch((error: unknown) => {
      bridgePromise = null;
      throw error;
    });
  }
  return bridgePromise;
}
