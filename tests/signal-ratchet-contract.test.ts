import test from "node:test";
import assert from "node:assert/strict";
import { requireSignalRatchetBridge } from "../src/lib/signal-ratchet-contract";

const bridge = () => ({ protocol_version: () => 2, ratchet_adapter_version: () => 1,
  ratchet_import_registration: () => new Uint8Array(),
  ratchet_establish: async () => new Uint8Array(), ratchet_encrypt: async () => new Uint8Array(),
  ratchet_decrypt: async () => new Uint8Array() });

test("registration-only or incompatible assets cannot enable the ratchet adapter", () => {
  for (const value of [null, undefined, {}, { protocol_version: () => 2 },
    { ...bridge(), protocol_version: () => 1 }, { ...bridge(), ratchet_adapter_version: () => 2 },
    { ...bridge(), ratchet_decrypt: undefined }]) {
    assert.throws(() => requireSignalRatchetBridge(value), /signal_ratchet_/);
  }
  const supported = bridge();
  assert.equal(requireSignalRatchetBridge(supported), supported);
});
