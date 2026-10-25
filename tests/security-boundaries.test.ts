import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { guardSameOrigin, requestIsSecure } from "../src/server/http";
import { notificationPath } from "../src/lib/notification-navigation";
import { registerSchema, resetPasswordSchema } from "../src/lib/schemas";
import { safeError } from "../src/server/safe-error";
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from "../src/server/password";
import { contentDisposition, isSafeInlineDocumentType } from "../src/server/content-disposition";

test("production CSRF guard uses the full configured origin and ignores forged host headers", () => {
  const previous = { CLIENT_URL: process.env.CLIENT_URL, NODE_ENV: process.env.NODE_ENV, RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL };
  Object.assign(process.env, { CLIENT_URL: "https://chat.example", NODE_ENV: "production", RENDER_EXTERNAL_URL: "https://fixture.onrender.com" });
  const request = (origin?: string, host = "chat.example", extra: Record<string, string> = {}) => new NextRequest("http://localhost:10000/api/profile", {
    method: "POST", headers: { host, ...(origin ? { origin } : {}), ...extra },
  });
  try {
    assert.equal(guardSameOrigin(request("https://chat.example")), null);
    assert.equal(guardSameOrigin(request("https://fixture.onrender.com")), null);
    for (const origin of ["http://chat.example", "https://evil.example", "null", "https://chat.example.evil", "https://user@chat.example", "https://chat.example/path"]) {
      assert.equal(guardSameOrigin(request(origin, "evil.example", { "x-forwarded-host": "evil.example" }))?.status, 403);
    }
    assert.equal(guardSameOrigin(request(undefined, "chat.example", { "sec-fetch-site": "cross-site" }))?.status, 403);
    assert.equal(guardSameOrigin(request()), null, "Non-browser authenticated clients retain support");
    assert(requestIsSecure(request(undefined, "localhost:10000", { "x-forwarded-proto": "http" })), "Production TLS configuration cannot be downgraded by headers");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("new passwords enforce bcrypt's byte boundary and logs exclude sensitive error details", () => {
  const password = "Aa1" + "é".repeat(35);
  assert.equal(password.length, 38);
  assert.equal(new TextEncoder().encode(password).length, 73);
  assert(!registerSchema.safeParse({ displayName: "Security test", username: "security_test", email: "test@example.invalid", password, confirmPassword: password, acceptTerms: true, acceptPrivacy: true }).success);
  assert(!resetPasswordSchema.safeParse({ token: "x".repeat(43), password, confirmPassword: password }).success);
  const valid = "Aa1" + "é".repeat(34);
  assert(resetPasswordSchema.safeParse({ token: "x".repeat(43), password: valid, confirmPassword: valid }).success);
  const error = Object.assign(new Error("secret-token in SQL details"), { code: "23505", detail: "private user", query: "sensitive SQL", headers: { authorization: "secret" } });
  assert.deepEqual(safeError(error), { kind: "Error", code: "23505" });
  assert.deepEqual(safeError({ message: "secret", code: "secret-token" }), { kind: "Error" });
});

test("notification navigation rejects executable and external URLs while preserving app deep links", () => {
  const origin = "https://chat.example";
  const id = "065e6c90-2b0e-464b-98a5-45cd9851e172";
  for (const value of ["javascript:alert(1)", "data:text/html,test", "//evil.example/app", "https://evil.example/app", "/api/auth/logout", "https://user@chat.example/app", "ziptalks://chat/../evil", "ziptalks://chat/not-a-uuid", null]) {
    assert.equal(notificationPath(value, origin), null);
  }
  assert.equal(notificationPath(`/app/chats/${id}?latest=1`, origin), `/app/chats/${id}?latest=1`);
  assert.equal(notificationPath(`ziptalks://chat/${id}?latest=1`, origin), `/app/chats/${id}?latest=1`);
  assert.equal(notificationPath("https://chat.example/app/profile#encryption-devices", origin), "/app/profile#encryption-devices");
});

test("password hashing rejects byte truncation and unknown logins use a real cost-12 comparison", async () => {
  await assert.rejects(hashPassword("Aa1" + "é".repeat(35)), /72-byte/);
  assert(DUMMY_PASSWORD_HASH.startsWith("$2b$12$"));
  assert.equal(await verifyPassword("not-an-account-password", DUMMY_PASSWORD_HASH), false);
});

test("download headers preserve international filenames and reject delimiter injection", () => {
  const value = contentDisposition('photo"\r\nX-Evil: yes\\é.png', false);
  assert(!value.includes("\r") && !value.includes("\n"));
  assert(value.includes("%C3%A9.png"));
  assert.equal(new Headers({ "Content-Disposition": value }).get("Content-Disposition"), value);
  assert.doesNotThrow(() => contentDisposition("unpaired\ud800.png", true));
});

test("only explicitly safe document MIME types are eligible for inline disposition", () => {
  assert.equal(isSafeInlineDocumentType("application/pdf"), true);
  assert.equal(isSafeInlineDocumentType(" Text/Plain; charset=utf-8 "), true);
  for (const mime of ["text/html", "application/xhtml+xml", "image/svg+xml", "application/zip", "application/octet-stream"]) {
    assert.equal(isSafeInlineDocumentType(mime), false, mime);
  }
});
