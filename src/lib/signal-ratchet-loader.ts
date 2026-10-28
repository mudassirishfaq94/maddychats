import "client-only";
import { requireSignalRatchetBridge, type SignalRatchetBridge } from "./signal-ratchet-contract";

let pending: Promise<SignalRatchetBridge> | undefined;

/** Separate assets: adding the adapter never changes the existing registration bridge. */
export function loadSignalRatchetBridge(): Promise<SignalRatchetBridge> {
  if (typeof window === "undefined") return Promise.reject(new Error("signal_ratchet_requires_browser"));
  return pending ??= (async () => {
    const path = new URL("/signal/ratchet-v1/maddy_signal_bridge.js", window.location.origin).href;
    const bridgeModule = await import(/* webpackIgnore: true */ path) as { default: () => Promise<unknown> };
    await bridgeModule.default();
    return requireSignalRatchetBridge(bridgeModule);
  })().catch(error => { pending = undefined; throw error; });
}
