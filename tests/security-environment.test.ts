import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewSecurityEnvironment } from "../scripts/check-security-env.mjs";

const valid = { NODE_ENV: "production", JWT_SECRET: "a".repeat(40), CRON_SECRET: "b".repeat(40),
  HEALTHCHECK_SECRET: "c".repeat(40), CLIENT_URL: "https://circlo.chat", CSP_ENFORCE: "1",
  DATABASE_URL: "postgresql://user:pass@db.example.com/app?sslmode=verify-full",
  RESEND_API_KEY: "fixture-not-a-live-provider-key", EMAIL_FROM: "Circlo <no-reply@circlo.chat>" };
test("deployment review catches secret publication, insecure origins and weakened TLS without printing values", () => {
  assert.deepEqual(reviewSecurityEnvironment(valid), []);
  const invalid = { ...valid, NEXT_PUBLIC_SERVICE_ROLE_KEY: "fixture-secret-never-print",
    CLIENT_URL: "http://circlo.chat", LOGIN_PERFORMANCE_DIAGNOSTICS: "1",
    DATABASE_URL: "postgresql://user:pass@db.example.com/app?sslmode=no-verify" };
  const report = reviewSecurityEnvironment(invalid);
  assert(report.some((x: { name: string }) => x.name === "NEXT_PUBLIC_SERVICE_ROLE_KEY"));
  assert(report.some((x: { name: string }) => x.name === "DATABASE_URL TLS"));
  assert(!JSON.stringify(report).includes("fixture-secret-never-print"));
  assert(!JSON.stringify(report).includes("user:pass"));
});
