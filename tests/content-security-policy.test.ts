import assert from "node:assert/strict";
import { test } from "node:test";
import { contentSecurityPolicy } from "../src/lib/content-security-policy";

test("production CSP permits WASM without general eval or unsafe inline scripts", () => {
  const policy = contentSecurityPolicy("random-server-nonce", false, "example.firebaseapp.com");
  const scripts = policy.split(";").find((directive) => directive.trim().startsWith("script-src"))!;
  assert(scripts.includes("'nonce-random-server-nonce'")); assert(scripts.includes("'strict-dynamic'")); assert(scripts.includes("'wasm-unsafe-eval'"));
  assert(!scripts.includes("'unsafe-eval'")); assert(!scripts.includes("'unsafe-inline'"));
  assert(policy.includes("report-uri /api/security/csp-report"));
  assert(!contentSecurityPolicy("safe", false, "evil.com; script-src *").includes("evil.com"));
});
