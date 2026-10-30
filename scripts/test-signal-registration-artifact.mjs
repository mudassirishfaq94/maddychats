import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Execute the actual generated glue/binary without a server, device, or account.
// Private bytes stay in this process and are never printed or uploaded.
const source = await readFile("public/signal/maddy_signal_bridge.js", "utf8");
const bridge = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
await bridge.default({ module_or_path: await readFile("public/signal/maddy_signal_bridge_bg.wasm") });
assert.equal(bridge.protocol_version(), 2);
const a = bridge.generate_identity(), b = bridge.generate_identity();
assert(a.privateIdentity.length > 0 && a.publicIdentity.length > 0);
assert.notDeepEqual(a.privateIdentity, b.privateIdentity);
assert.notDeepEqual(a.publicIdentity, b.publicIdentity);
const registration = bridge.generate_device_registration(2);
assert.equal(registration.oneTimePrekeys.length, 2);
assert.equal(registration.privateOneTimePrekeys.length, 2);
assert(registration.signedPrekey.signature.length > 0 && registration.kyberPrekey.signature.length > 0);
assert(registration.privateKyberPrekey.privateKey.length > 0);
assert(registration.protocolDeviceId > 0);
assert.throws(() => bridge.generate_device_registration(101));
for (const count of [0, 101]) assert.throws(() => bridge.generate_one_time_prekeys(count));
const prekeys = bridge.generate_one_time_prekeys(2);
assert.equal(prekeys.oneTimePrekeys.length, 2);
assert.equal(prekeys.privateOneTimePrekeys.length, 2);
assert.notDeepEqual(prekeys.oneTimePrekeys[0].publicKey, prekeys.oneTimePrekeys[1].publicKey);
assert.throws(() => bridge.canonicalize_session_record(new Uint8Array([255, 255, 255])));
console.log("PASS rebuilt registration WASM: real randomized identities/prekeys, bounded requests, malformed session rejection. Not a message-ratchet test.");
