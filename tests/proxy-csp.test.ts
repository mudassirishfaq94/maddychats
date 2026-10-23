import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { NextRequest } from "next/server";
import { contentSecurityPolicy } from "../src/lib/content-security-policy";

let proxy: typeof import("../src/proxy").proxy;
let pool: typeof import("../src/db").pool;

before(async () => {
  const previous = process.env.DATABASE_URL;
  // Anonymous login-page requests never execute a database query.
  process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/proxy_csp_test";
  try {
    ({ proxy } = await import("../src/proxy"));
    ({ pool } = await import("../src/db"));
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

after(async () => { await pool?.end(); });

for (const development of [false, true]) {
  for (const enforce of [false, true]) {
    test(`proxy forwards the nonce CSP with development=${development}, enforcement=${enforce}`, async t => {
      const environment = {
        NODE_ENV: development ? "development" : "production",
        CSP_ENFORCE: enforce ? "1" : "0",
        CLIENT_URL: "https://chat.example.invalid",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "legacy-phone-auth.example.invalid",
      };
      const saved = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
      t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      });
      Object.assign(process.env, environment);
      t.mock.method(pool, "query", () => { throw new Error("Unexpected database query"); });

      const request = () => new NextRequest(`${environment.CLIENT_URL}/login`, {
        headers: {
          host: "chat.example.invalid",
          "x-nonce": "attacker-chosen-nonce",
          "Content-Security-Policy": "default-src *; script-src 'unsafe-inline'",
        },
      });
      const first = await proxy(request());
      const second = await proxy(request());
      assert.equal(first.headers.get("x-middleware-next"), "1");
      const nonce = first.headers.get("x-middleware-request-x-nonce");
      assert(nonce);
      assert.equal(Buffer.from(nonce, "base64").length, 18);
      assert.notEqual(nonce, "attacker-chosen-nonce");
      assert.notEqual(nonce, second.headers.get("x-middleware-request-x-nonce"));

      const expected = contentSecurityPolicy(nonce, development);
      assert.equal(first.headers.get("x-middleware-request-content-security-policy"), expected);
      const responseHeader = enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
      const otherHeader = enforce ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
      assert.equal(first.headers.get(responseHeader), expected);
      assert.equal(first.headers.get(otherHeader), null);
      assert.doesNotMatch(expected, /legacy-phone-auth|firebaseapp\.com|firebaseio\.com|recaptcha\.net/);
    });
  }
}
