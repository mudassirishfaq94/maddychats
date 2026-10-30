import "client-only";
import type { SignalRegistrationBridge } from "./e2ee-signal-registration";

/** Experimental registration/serialization only. Supported chats do not import this bridge. */
type RegistrationModule = SignalRegistrationBridge & {
  protocol_version(): number;
  canonicalize_session_record(serialized: Uint8Array): Uint8Array;
  generate_identity(): unknown;
};
let bridgePromise: Promise<RegistrationModule> | null = null;

export function loadSignalBridge(): Promise<RegistrationModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("signal_bridge_requires_browser"));
  if (!bridgePromise) bridgePromise = (async () => {
    const url = new URL("/signal/maddy_signal_bridge.js", window.location.origin).href;
    const bridgeModule = await import(/* webpackIgnore: true */ url) as RegistrationModule & { default: () => Promise<unknown> };
    await bridgeModule.default();
    for (const name of ["protocol_version", "canonicalize_session_record", "generate_identity", "generate_device_registration", "generate_one_time_prekeys"] as const) {
      if (typeof bridgeModule[name] !== "function") throw new Error("signal_registration_artifact_mismatch");
    }
    if (bridgeModule.protocol_version() !== 2) throw new Error("signal_bridge_protocol_mismatch");
    return bridgeModule;
  })().catch((error: unknown) => { bridgePromise = null; throw error; });
  return bridgePromise;
}
