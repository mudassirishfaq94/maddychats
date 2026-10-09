import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { createGoogleEmailProof, readGoogleEmailProof, GOOGLE_EMAIL_PROOF_AUDIENCE } from "../src/server/google-email-proof";

process.env.JWT_SECRET = "google-proof-tests-only-at-least-thirty-two-characters";

test("Google ownership proof is scoped to the exact user and email", async () => {
  const token = await createGoogleEmailProof("test-user", "Owner@example.invalid");
  assert(await readGoogleEmailProof(token, "test-user", "owner@example.invalid"));
  assert.equal(await readGoogleEmailProof(token, "other-user", "owner@example.invalid"), null);
  assert.equal(await readGoogleEmailProof(token, "test-user", "other@example.invalid"), null);
  assert.equal(await readGoogleEmailProof(undefined, "test-user", "owner@example.invalid"), null);
  assert.equal(await readGoogleEmailProof(token.slice(0, -8) + "forged", "test-user", "owner@example.invalid"), null);
});

test("expired proofs and ordinary session tokens cannot verify email", async () => {
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  const claims = { emailHash: createHash("sha256").update("owner@example.invalid").digest("hex") };
  const expired = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject("test-user").setJti(randomUUID())
    .setIssuer("maddy-chats").setAudience(GOOGLE_EMAIL_PROOF_AUDIENCE)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 400).setExpirationTime("-1s").sign(key);
  const session = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject("test-user").setJti(randomUUID())
    .setIssuer("maddy-chats").setAudience("maddy-chats-web").setIssuedAt().setExpirationTime("5m").sign(key);
  assert.equal(await readGoogleEmailProof(expired, "test-user", "owner@example.invalid"), null);
  assert.equal(await readGoogleEmailProof(session, "test-user", "owner@example.invalid"), null);
});
