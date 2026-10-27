import assert from "node:assert/strict";
import { test } from "node:test";
import { admissionProtected, createAuthAdmission } from "../src/server/auth-admission";
import { challengeConfiguration, verifyChallenge, verifySingleUseChallenge } from "../src/server/turnstile";

const config = { enabled: true, configured: true, siteKey: "fixture-site", secret: "fixture-secret" };
const reply = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as typeof fetch;

test("Turnstile validates action, hostname and success; expired/reused tokens fail closed", async () => {
  assert.equal(await verifyChallenge("token", "login", "circlo.chat", config, reply({ success: true, action: "login", hostname: "circlo.chat" })), "ok");
  for (const body of [null, {}, { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, action: "register", hostname: "circlo.chat" },
    { success: true, action: "login", hostname: "evil.example" }, { success: "true", action: "login", hostname: "circlo.chat" }]) {
    assert.notEqual(await verifyChallenge("token", "login", "circlo.chat", config, reply(body)), "ok");
  }
});

test("Turnstile rejects missing and oversized proof without contacting provider; no secret reaches client config", async () => {
  const never = (async () => { throw new Error("must not contact"); }) as typeof fetch;
  for (const token of [undefined, "", {}, "x".repeat(2049)]) assert.equal(await verifyChallenge(token, "login", "circlo.chat", config, never), "invalid");
  assert.equal(await verifyChallenge("token", "login", "circlo.chat", { ...config, configured: false }, never), "unavailable");
  assert.equal(await verifyChallenge("token", "login", "circlo.chat", config, reply({}, 503)), "unavailable");
  assert.equal(await verifyChallenge("token", "login", "circlo.chat", config, never), "unavailable");
  assert.equal(challengeConfiguration({ TURNSTILE_REQUIRED: "true" }).enabled, true);
  assert.equal(challengeConfiguration({ TURNSTILE_SECRET_KEY: "partial" }).enabled, true);
  assert.equal(challengeConfiguration({}).enabled, false);
});

test("proof sent only to fixed Siteverify endpoint without visitor identifiers", async () => {
  const request = (async (url, init) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.deepEqual(JSON.parse(String(init?.body)), { secret: "fixture-secret", response: "proof" });
    assert.equal(init?.cache, "no-store"); assert(init?.signal);
    return Response.json({ success: true, action: "register", hostname: "circlo.chat" });
  }) as typeof fetch;
  assert.equal(await verifyChallenge("proof", "register", "circlo.chat", config, request), "ok");
});

test("admission limits bursts, refills, bounds memory, and stops distributed bursts", () => {
  const gate = createAuthAdmission();
  for (let i = 0; i < 10; i++) assert(gate.allow("192.0.2.1", 0));
  assert(!gate.allow("192.0.2.1", 0)); assert(gate.allow("192.0.2.1", 3000));
  const distributed = createAuthAdmission();
  for (let i = 0; i < 60; i++) assert(distributed.allow(`192.0.2.${i}`, 0));
  assert(!distributed.allow("198.51.100.1", 0));
  assert(distributed.allow("198.51.100.1", 500));
  for (let i = 0; i < 10000; i++) distributed.allow(`client-${i}`, 500);
  assert(distributed.size() <= 4096);
  assert(distributed.allow("after-expiry", 120000));
});

test("admission leaves logout, session reads, realtime and regular messages alone", () => {
  assert(admissionProtected("/api/auth/login", "POST"));
  assert(admissionProtected("/api/auth/resend-verification", "POST"));
  for (const path of ["/api/auth/logout", "/api/auth/me", "/api/auth/challenge", "/api/events", "/api/conversations/a/messages", "/api/auth/login/other"]) assert(!admissionProtected(path, "POST"));
  assert(!admissionProtected("/api/auth/login", "GET"));
});

test("concurrent provider successes consume a proof only once; invalid proofs never reach store", async () => {
  const used = new Set<string>();
  const consume = async (digest: string) => {
    assert(/^[a-f0-9]{64}$/.test(digest)); assert.notEqual(digest, "proof");
    if (used.has(digest)) return false; used.add(digest); return true;
  };
  const provider = reply({ success: true, action: "login", hostname: "circlo.chat" });
  const results = await Promise.all([1, 2].map(() => verifySingleUseChallenge("proof", "login", "circlo.chat", config, consume, provider)));
  assert.deepEqual(results.sort(), ["invalid", "ok"]); assert.equal(used.size, 1);
  assert.equal(await verifySingleUseChallenge(undefined, "login", "circlo.chat", config, consume, provider), "invalid");
  assert.equal(used.size, 1);
  assert.equal(await verifySingleUseChallenge("fresh", "login", "circlo.chat", config, async () => { throw Error("store unavailable"); }, provider), "unavailable");
});

test("public dummy keys cannot enable challenges in production", () => {
  const env = { NODE_ENV: "production", TURNSTILE_REQUIRED: "true", TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" };
  assert.equal(challengeConfiguration(env).enabled, true); assert.equal(challengeConfiguration(env).configured, false);
  assert.equal(challengeConfiguration({ ...env, NODE_ENV: "test" }).configured, true);
});
