import "client-only";

import type { SignalRegistrationBridge } from "./e2ee-signal-registration";

type SignalWasmModule = SignalRegistrationBridge & {
  protocol_version(): number;
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
