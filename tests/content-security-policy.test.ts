import assert from "node:assert/strict";
import { test } from "node:test";
import { contentSecurityPolicy } from "../src/lib/content-security-policy";

test("production CSP permits WASM without general eval or unsafe inline scripts", () => {
  const policy = contentSecurityPolicy("random-server-nonce", false);
  const scripts = policy.split(";").find((directive) => directive.trim().startsWith("script-src"))!;
  assert(scripts.includes("'nonce-random-server-nonce'")); assert(scripts.includes("'strict-dynamic'")); assert(scripts.includes("'wasm-unsafe-eval'"));
  assert(!scripts.includes("'unsafe-eval'")); assert(!scripts.includes("'unsafe-inline'"));
  assert(policy.includes("report-uri /api/security/csp-report"));
  assert(!policy.includes("firebaseapp.com"));
  assert(!policy.includes("firebaseio.com"));
});

function directives(policy: string) {
  return new Map(policy.split(";").map(directive => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }));
}

for (const development of [false, true]) {
  const mode = development ? "development" : "production";

  test(`${mode} CSP limits connections and frames to the remaining Google origins`, () => {
    const policy = contentSecurityPolicy("server-nonce", development);
    const parsed = directives(policy);
    assert.deepEqual(parsed.get("connect-src"), ["'self'", "https://*.googleapis.com"]);
    assert.deepEqual(parsed.get("frame-src"), ["https://www.google.com"]);
    assert.doesNotMatch(policy, /firebaseapp\.com|firebaseio\.com|recaptcha\.net/);
  });

  test(`${mode} CSP binds scripts to each nonce while retaining the eval restriction`, () => {
    const first = directives(contentSecurityPolicy("YWJjZGVmZ2hpamtsbW5vcHFy", development));
    const second = directives(contentSecurityPolicy("c3R1dnd4eXowMTIzNDU2Nzg5", development));
    const scriptSources = first.get("script-src")!;
    assert(scriptSources.includes("'nonce-YWJjZGVmZ2hpamtsbW5vcHFy'"));
    assert(second.get("script-src")!.includes("'nonce-c3R1dnd4eXowMTIzNDU2Nzg5'"));
    assert(!second.get("script-src")!.includes("'nonce-YWJjZGVmZ2hpamtsbW5vcHFy'"));
    assert.equal(scriptSources.includes("'unsafe-eval'"), development);
    assert(!scriptSources.includes("'unsafe-inline'"));
    first.delete("script-src");
    second.delete("script-src");
    assert.deepEqual(first, second, "Changing the nonce cannot change resource permissions");
  });
}
