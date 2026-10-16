import assert from "node:assert/strict";
import test from "node:test";
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "../src/lib/schemas";
import { validateUpload } from "../src/server/storage";
import { MEDIA_MAX_BYTES } from "../src/lib/media-limits";

test("authentication fields reject malformed, oversized and mismatched values before proceeding", () => {
  const valid = { displayName: "Test User", username: "test_user", email: "person@example.invalid", password: "StrongPassword9", confirmPassword: "StrongPassword9", acceptTerms: true, acceptPrivacy: true };
  assert(registerSchema.safeParse(valid).success);
  for (const patch of [{ username: "ab" }, { username: "x".repeat(21) }, { username: "<script>" }, { email: "bad" }, { displayName: " " }, { displayName: "x".repeat(51) }, { password: "weak" }, { password: "aA1" + "😀".repeat(18) }, { confirmPassword: "different" }, { acceptTerms: false }, { acceptPrivacy: false }]) assert(!registerSchema.safeParse({ ...valid, ...patch }).success, JSON.stringify(Object.keys(patch)));
  assert(!loginSchema.safeParse({ identifier: "x".repeat(255), password: "anything" }).success);
  assert(!loginSchema.safeParse({ identifier: "test_user", password: "😀".repeat(19) }).success);
  assert.equal(forgotPasswordSchema.parse({ email: "  person@example.invalid  " }).email, "person@example.invalid");
  assert(!resetPasswordSchema.safeParse({ token: "x".repeat(129), password: valid.password, confirmPassword: valid.password }).success);
});

test("media accepts 10 MB photos/videos and rejects oversized or executable uploads", () => {
  const original = { image: process.env.MAX_IMAGE_MB, file: process.env.MAX_FILE_MB };
  delete process.env.MAX_IMAGE_MB; delete process.env.MAX_FILE_MB;
  try {
    for (const [name, mime] of [["photo.jpg", "image/jpeg"], ["video.mp4", "video/mp4"]]) {
      assert(validateUpload(name, mime, MEDIA_MAX_BYTES, "message").ok);
      assert(!validateUpload(name, mime, MEDIA_MAX_BYTES + 1, "message").ok);
    }
    assert(!validateUpload("photo.exe", "image/jpeg", 100, "message").ok);
    assert(!validateUpload("script.svg", "image/svg+xml", 100, "message").ok);
  } finally {
    if (original.image === undefined) delete process.env.MAX_IMAGE_MB; else process.env.MAX_IMAGE_MB = original.image;
    if (original.file === undefined) delete process.env.MAX_FILE_MB; else process.env.MAX_FILE_MB = original.file;
  }
});
