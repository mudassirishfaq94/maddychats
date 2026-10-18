import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { callIceConfiguration, loadCallIceConfiguration } from "../src/server/call-ice";

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

test("managed relay uses server-only credentials, bounded TTL, allowlisted endpoints and per-user caching",async()=>{
  const env={CF_TURN_KEY_ID:"isolated-fixture-id",CF_TURN_API_TOKEN:"isolated-provider-secret-token"};let calls=0;
  const send:typeof fetch=async(input,init)=>{
    calls++;assert.equal(String(input),"https://rtc.live.cloudflare.com/v1/turn/keys/isolated-fixture-id/credentials/generate-ice-servers");
    assert.equal((init!.headers as Record<string,string>).Authorization,`Bearer ${env.CF_TURN_API_TOKEN}`);
    assert.equal(JSON.parse(init!.body as string).ttl,3600);
    return new Response(JSON.stringify({iceServers:[{urls:["turns:turn.cloudflare.com:443?transport=tcp","turn:attacker.invalid:3478","turn:turn.cloudflare.com:53"],username:`ephemeral-${calls}`,credential:"temporary-credential"}]}),{status:201});
  };
  const first=await loadCallIceConfiguration("fixture-user-a",env,send);assert.equal(first.relayConfigured,true);assert.equal(JSON.stringify(first).includes(env.CF_TURN_API_TOKEN),false);
  assert.deepEqual(first.iceServers[0].urls,["turns:turn.cloudflare.com:443?transport=tcp"]);
  assert.deepEqual(await loadCallIceConfiguration("fixture-user-a",env,send),first);assert.equal(calls,1);
  assert.notDeepEqual(await loadCallIceConfiguration("fixture-user-b",env,send),first);assert.equal(calls,2);
  await assert.rejects(loadCallIceConfiguration("fixture-user-c",env,async()=>new Response("unavailable",{status:503})));
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
