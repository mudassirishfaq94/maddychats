import assert from "node:assert/strict";
import test from "node:test";
import { resolveClientIp } from "../src/server/client-ip";
import { googleLinkBinding, matchesGoogleLinkBinding } from "../src/server/google-link-binding";
import { hashPassword, verifyPassword } from "../src/server/password";
import bcrypt from "bcrypt";

test("Render client IP ignores attacker-controlled forwarding chains and fails closed", () => {
  const render = { render: true, production: true, trustedHops: "1" };
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.4", "x-forwarded-for": "198.51.100.8, 192.0.2.9", "x-real-ip": "198.51.100.9" });
  assert.equal(resolveClientIp(headers, render), "203.0.113.4");
  headers.set("x-forwarded-for", "198.51.100.10");
  assert.equal(resolveClientIp(headers, render), "203.0.113.4");
  for (const bad of ["", "garbage", "203.0.113.4, 198.51.100.1", "203.0.113.4:123", "fe80::1%eth0"]) {
    headers.set("cf-connecting-ip", bad); assert.equal(resolveClientIp(headers, render), "unknown");
  }
  headers.delete("cf-connecting-ip"); assert.equal(resolveClientIp(headers, render), "unknown");
});

test("proxy trust is explicit outside Render and addresses have canonical bounded keys", () => {
  const headers = new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.2, 192.0.2.3", "cf-connecting-ip": "198.51.100.44" });
  assert.equal(resolveClientIp(headers, { render: false, production: true }), "unknown");
  assert.equal(resolveClientIp(headers, { render: false, production: true, trustedHops: "2" }), "203.0.113.2");
  headers.set("x-forwarded-for", "198.51.100.2, 198.51.100.3, 203.0.113.2, 192.0.2.3");
  assert.equal(resolveClientIp(headers, { render: false, production: true, trustedHops: "2" }), "203.0.113.2");
  for (const bad of ["0", "-1", "1.5", "17", "many"]) assert.equal(resolveClientIp(headers, { render: false, production: true, trustedHops: bad }), "unknown");
  headers.set("cf-connecting-ip", "2001:0DB8:0000:0000:0000:0000:0000:0001");
  assert.equal(resolveClientIp(headers, { render: true, production: true }), "2001:db8::1");
  headers.set("cf-connecting-ip", "::ffff:192.0.2.3");
  assert.equal(resolveClientIp(headers, { render: true, production: true }), "192.0.2.3");
});

test("Google linking proof cannot be transferred to another account, session or OAuth flow", () => {
  process.env.JWT_SECRET ??= "disposable-oauth-binding-test-secret-at-least-thirty-two";
  const proof = googleLinkBinding("user-a", "session-a", "state-a");
  assert(matchesGoogleLinkBinding(proof, "user-a", "session-a", "state-a"));
  for (const [user, session, state] of [["user-b", "session-a", "state-a"], ["user-a", "session-b", "state-a"], ["user-a", "session-a", "state-b"]]) assert.equal(matchesGoogleLinkBinding(proof, user, session, state), false);
  assert.equal(matchesGoogleLinkBinding(undefined, "user-a", "session-a", "state-a"), false);
  assert.equal(matchesGoogleLinkBinding("not-a-proof", "user-a", "session-a", "state-a"), false);
});

test("password verification never accepts bcrypt-truncated suffixes, including multibyte input", async () => {
  for (const password of ["Aa1" + "x".repeat(69), "Aa1" + "é".repeat(34) + "x"]) {
    assert.equal(Buffer.byteLength(password), 72);
    const hash = await hashPassword(password);
    assert.equal(await bcrypt.compare(password + "suffix", hash), true, "Demonstrate the underlying bcrypt truncation behavior");
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword(password + "suffix", hash), false);
  }
});
