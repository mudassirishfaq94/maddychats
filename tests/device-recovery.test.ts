import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecoveryFile, readRecoveryFile, validateRecoveryBundle, type RecoveryBundle } from "../src/lib/device-recovery-file";
import { generateKeyPair, exportPrivateKey, exportPublicKey, encryptPrivateKeyForStorage } from "../src/lib/crypto";
import { canonicalDestination } from "../src/server/canonical-domain";
import { recoveryPhraseFromEntropy, recoveryPhraseToEntropy } from "../src/lib/recovery-phrase";

test("recovery file authenticates owner, private key, ciphertext and separate recovery code", async () => {
  const pair = await generateKeyPair();
  const secret = "a".repeat(64);
  const bundle: RecoveryBundle = { version: 1, userId: "owner", deviceId: "original-device", secret,
    keypair: JSON.stringify({ publicKey: await exportPublicKey(pair.publicKey), encryptedPrivateKey: "v2:" + await encryptPrivateKeyForStorage(await exportPrivateKey(pair.privateKey), secret) }),
    keys: { e2ee_sentkeys_owner_chat: JSON.stringify([{ fingerprint: "fingerprint", wrapped: "ciphertext" }]) } };
  const { file, code } = await createRecoveryFile(bundle);
  assert.equal(code.trim().split(/\s+/).length, 24);
  assert.deepEqual(recoveryPhraseToEntropy(code.toUpperCase()), recoveryPhraseToEntropy(code));
  assert(!file.includes(secret) && !file.includes("original-device"));
  assert.deepEqual(await readRecoveryFile(file, code, "owner"), bundle);
  await assert.rejects(readRecoveryFile(file, code, "other-account"), /belongs to another account/);
  await assert.rejects(readRecoveryFile(file, "A".repeat(43) + "=", "owner"), /do not match this file, or the file is damaged/);
  const altered = JSON.parse(file); altered.ciphertext = "AAAA" + altered.ciphertext.slice(4);
  await assert.rejects(readRecoveryFile(JSON.stringify(altered), code, "owner"), /do not match this file, or the file is damaged/);
  await assert.rejects(validateRecoveryBundle({ ...bundle, keys: { maddy_session: "credential" } }, "owner"), /recovery file is damaged/);
  const other = await generateKeyPair();
  await assert.rejects(validateRecoveryBundle({ ...bundle, keypair: JSON.stringify({ ...JSON.parse(bundle.keypair), publicKey: await exportPublicKey(other.publicKey) }) }, "owner"));
});

test("24-word recovery phrases round-trip and older 32-byte codes remain accepted", () => {
  const entropy = new Uint8Array(32).fill(42);
  const phrase = recoveryPhraseFromEntropy(entropy);
  assert.deepEqual(recoveryPhraseToEntropy(phrase), entropy);
  const olderCode = btoa(Array.from(entropy, value => String.fromCharCode(value)).join(""));
  assert.deepEqual(recoveryPhraseToEntropy(olderCode), entropy);
});

test("old-domain navigation offers local migration and Google starts on the canonical origin", () => {
  const canonical = "https://circlo.chat", legacy = "https://fixture.onrender.com";
  assert.equal(canonicalDestination("fixture.onrender.com", "/app/chats", "", canonical, legacy), legacy + "/device-migration");
  assert.equal(canonicalDestination("fixture.onrender.com", "/device-migration", "", canonical, legacy), null);
  assert.equal(canonicalDestination("fixture.onrender.com", "/api/auth/google", "?next=%2Fapp", canonical, legacy), canonical + "/api/auth/google?next=%2Fapp");
  assert.equal(canonicalDestination("circlo.chat", "/app", "", canonical, legacy), null);
  assert.equal(canonicalDestination("attacker.example", "/app", "", canonical, legacy), null);
  assert.equal(new URL(canonicalDestination("fixture.onrender.com", "//attacker.example", "", canonical, legacy)!).origin, canonical);
  assert.equal(canonicalDestination("fixture.onrender.com", "/api/e2ee/keys", "", canonical, legacy), null);
});
