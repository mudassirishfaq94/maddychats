import "client-only";

/**
 * WASM bridge loader for the Signal Protocol implementation.
 *
 * The Rust/WASM bridge (public/signal/maddy_signal_bridge) provides:
 * - X3DH session establishment (create_x3dh_session, process_x3dh_initial_message)
 * - Session record verification (verify_session_record)
 * - Chain key extraction for the Double Ratchet (get_sender_chain_key, get_receiver_chain_key)
 * - Chain advancement for forward secrecy (advance_sender_chain, advance_receiver_chain)
 * - Message signature verification (verify_message_signature)
 *
 * **REMAINING BEFORE PRODUCTION:**
 * - Rust WASM bridge must be rebuilt from signal-bridge/ with cargo
 * - Formal security audit by external cryptography consultant
 */

import type { SignalRegistrationBridge } from "./e2ee-signal-registration";

type SignalWasmModule = SignalRegistrationBridge & {
  protocol_version(): number;
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
      const module = await import(/* webpackIgnore: true */ url) as SignalWasmModule & { default: () => Promise<unknown> };
      await module.default();
      if (module.protocol_version() !== 2) throw new Error("signal_bridge_protocol_mismatch");
      return module;
    })().catch((error: unknown) => {
      bridgePromise = null;
      throw error;
    });
  }
  return bridgePromise;
}
