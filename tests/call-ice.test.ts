import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { callIceConfiguration } from "../src/server/call-ice";

test("relay credentials are expiring, user scoped and never disclose the shared secret", () => {
  const secret = "isolated-test-secret-32-bytes-or-longer";
  const env = { TURN_URLS: "turn:relay.example.invalid:3478?transport=udp,turns:relay.example.invalid:5349?transport=tcp", TURN_SECRET: secret };
  const config = callIceConfiguration("user-one", env, 1000000);
  assert.equal(config.relayConfigured, true);
  const relay = config.iceServers[1];
  assert.equal(relay.username!.split(":")[0], "4600");
  assert.equal(relay.credential, createHmac("sha1", secret).update(relay.username!).digest("base64"));
  assert.notEqual(relay.username, callIceConfiguration("user-two", env, 1000000).iceServers[1].username);
  assert.equal(JSON.stringify(config).includes(secret), false);
  assert.equal(JSON.stringify(config).includes("user-one"), false);
});

test("absent, weak or malformed relay settings retain direct calling without publishing credentials", () => {
  for (const env of [{}, { TURN_SECRET: "short", TURN_URLS: "turn:relay.example.invalid" },
    { TURN_SECRET: "x".repeat(32), TURN_URLS: "https://attacker.invalid" },
    { TURN_SECRET: "x".repeat(32), TURN_URLS: "turn:user:password@relay.example.invalid" }]) {
    const config = callIceConfiguration("user", env);
    assert.equal(config.relayConfigured, false);
    assert.equal(config.iceServers.length, 1);
  }
});
