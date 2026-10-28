import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const files = new Map([
  ["/bridge.js", "public/signal/ratchet-v1/maddy_signal_bridge.js"],
  ["/maddy_signal_bridge_bg.wasm", "public/signal/ratchet-v1/maddy_signal_bridge_bg.wasm"],
]);
const server = createServer(async (request, response) => {
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
  const file = files.get(request.url);
  if (!file) { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Isolated protocol test</title>"); return; }
  try {
    response.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm" : "text/javascript");
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const browser = await chromium.launch();
let deadline;
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await Promise.race([page.evaluate(async () => {
    const bridge = await import("/bridge.js"); await bridge.default();
    const encoder = new TextEncoder(), decoder = new TextDecoder();
    const encode = value => encoder.encode(JSON.stringify(value));
    const decode = value => JSON.parse(decoder.decode(value));
    const a = bridge.generate_device_registration(8), b = bridge.generate_device_registration(8);
    const alice = decode(bridge.ratchet_import_registration(encode(a), "11111111-1111-4111-8111-111111111111"));
    const bob = decode(bridge.ratchet_import_registration(encode(b), "22222222-2222-4222-8222-222222222222"));
    let aliceState = { ...alice, remote: bob.local, approvedRemoteIdentity: b.identityKey, sessionRecord: null };
    let bobState = { ...bob, remote: alice.local, approvedRemoteIdentity: a.identityKey, sessionRecord: null };
    const bundle = { registrationId: b.registrationId, identityKey: b.identityKey,
      signedPrekeyId: b.signedPrekey.keyId, signedPrekey: b.signedPrekey.publicKey, signedPrekeySignature: b.signedPrekey.signature,
      kyberPrekeyId: b.kyberPrekey.keyId, kyberPrekey: b.kyberPrekey.publicKey, kyberPrekeySignature: b.kyberPrekey.signature,
      oneTimePrekey: [b.oneTimePrekeys[0].keyId, b.oneTimePrekeys[0].publicKey] };
    aliceState = decode(await bridge.ratchet_establish(encode(aliceState), encode(bundle)));
    let received = 0, rejectedReplays = 0;
    for (let index = 0; index < 10; index++) {
      const outgoing = decode(await bridge.ratchet_encrypt(encode(aliceState), encoder.encode("synthetic browser message")));
      aliceState = outgoing.state;
      const incoming = decode(await bridge.ratchet_decrypt(encode(bobState), outgoing.messageType, new Uint8Array(outgoing.ciphertext)));
      bobState = incoming.state;
      if (decoder.decode(new Uint8Array(incoming.plaintext)) === "synthetic browser message") received++;
      try { await bridge.ratchet_decrypt(encode(bobState), outgoing.messageType, new Uint8Array(outgoing.ciphertext)); } catch { rejectedReplays++; }
      const reply = decode(await bridge.ratchet_encrypt(encode(bobState), encoder.encode("synthetic browser reply"))); bobState = reply.state;
      const opened = decode(await bridge.ratchet_decrypt(encode(aliceState), reply.messageType, new Uint8Array(reply.ciphertext))); aliceState = opened.state;
      if (decoder.decode(new Uint8Array(opened.plaintext)) === "synthetic browser reply") received++;
    }
    let chainExtractionRejected = false, invalidRegistrationRejected = false;
    try { bridge.get_sender_chain_key(new Uint8Array(aliceState.sessionRecord)); } catch { chainExtractionRejected = true; }
    try { bridge.ratchet_import_registration(encode({ ...a, identityKey: b.identityKey }), alice.local.name); } catch { invalidRegistrationRejected = true; }
    // Do not return identities, private state, plaintext or ciphertext to logs.
    return { received, rejectedReplays, consumedPrekey: bobState.prekeys.length === 7,
      chainExtractionRejected, invalidRegistrationRejected, adapterVersion: bridge.ratchet_adapter_version() };
  }), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Signal browser test exceeded 30 seconds")), 30000); })]);
  assert.deepEqual(result, { received: 20, rejectedReplays: 10, consumedPrekey: true,
    chainExtractionRejected: true, invalidRegistrationRejected: true, adapterVersion: 1 });
  console.log("PASS actual browser WASM: two devices, 20 readable messages, ten rejected replays, consumed prekey, invalid-registration and raw-chain rejection");
} finally {
  clearTimeout(deadline);
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
