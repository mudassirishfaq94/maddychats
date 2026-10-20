/**
 * Headless E2EE verification — exercises the exact functions the app uses:
 *   key pair generation, conversation-key exchange between two devices,
 *   text encrypt/decrypt, media wrap/decrypt, and fingerprint formatting.
 *
 * Run: npx tsx scripts/verify-e2ee.ts
 */
import {
  generateKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPrivateKey,
  importPublicKey,
  generateConversationKey,
  exportSymmetricKey,
  importSymmetricKey,
  encryptKeyForUser,
  decryptKeyFromSender,
  encryptMessage,
  decryptMessage,
  encryptBytes,
  decryptBytes,
  conversationFingerprint,
} from "../src/lib/crypto";

function assert(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

(async () => {
  // 1. Both users generate keypairs (RSA-OAEP) — same as useE2EE init.
  const alicePair = await generateKeyPair();
  const bobPair = await generateKeyPair();
  const alicePub = await exportPublicKey(alicePair.publicKey);
  const bobPub = await exportPublicKey(bobPair.publicKey);
  assert(alicePub.length > 100 && bobPub.length > 100, "public keys export to base64");

  // Simulated round-trip through server storage (private keys as JWK JSON).
  const alicePrivJwk = await exportPrivateKey(alicePair.privateKey);
  const bobPrivJwk = await exportPrivateKey(bobPair.privateKey);
  const alicePriv = await importPrivateKey(alicePrivJwk);
  const bobPriv = await importPrivateKey(bobPrivJwk);

  // 2. Alice creates the conversation key and shares it to Bob's device.
  const convKey = await generateConversationKey();
  const forBob = await encryptKeyForUser(convKey, await importPublicKey(bobPub));
  const bobGetsKey = await decryptKeyFromSender(forBob, bobPriv);
  const keyA = await exportSymmetricKey(convKey);
  const keyB = await exportSymmetricKey(bobGetsKey);
  assert(keyA === keyB, "both devices end up with the SAME conversation key");

  // 3. Alice sends an encrypted text message; Bob decrypts it.
  const plaintext = "Hello Bob — this secret should never reach the server!";
  const ciphertext = await encryptMessage(plaintext, convKey);
  assert(ciphertext !== plaintext, "ciphertext differs from plaintext");
  assert(!ciphertext.includes("secret"), "plaintext does not leak in ciphertext");
  const bobPlain = await decryptMessage(ciphertext, bobGetsKey);
  assert(bobPlain === plaintext, "Bob decrypts Alice's message");

  // 4. Media: per-file key wrapped with the conversation key (upload path).
  const mediaBytes = new TextEncoder().encode(
    "fake jpeg bytes".repeat(2000),
  ).buffer as ArrayBuffer;
  const mediaKey = await generateConversationKey();
  const mediaKeyB64 = await exportSymmetricKey(mediaKey);
  const encFile = await encryptBytes(mediaBytes, mediaKey);
  const wrappedKey = await encryptBytes(
    new TextEncoder().encode(mediaKeyB64) as unknown as ArrayBuffer,
    convKey,
  );

  // Receiver unwraps + decrypts (same order as decryptMedia in the hook).
  const unwrapped = await decryptBytes(wrappedKey, bobGetsKey);
  const mediaKey2 = await importSymmetricKey(
    new TextDecoder().decode(unwrapped),
  );
  const decFile = await decryptBytes(encFile, mediaKey2);
  const round = new Uint8Array(decFile);
  const orig = new Uint8Array(mediaBytes);
  assert(
    round.length === orig.length &&
      round.every((b, i) => b === orig[i]),
    "media bytes round-trip through wrap + decrypt",
  );

  // 5. Fingerprint is deterministic + human-readable.
  const fp1 = await conversationFingerprint(convKey);
  const fp2 = await conversationFingerprint(convKey);
  assert(fp1 === fp2, "fingerprint is deterministic");
  assert(/^\d{5} \d{5} \d{5} \d{5} \d{5} \d{5}$/.test(fp1), "fingerprint is 6 groups of 5 digits");
  console.log(`fingerprint: ${fp1}`);

  // 6. Wrong key fails (tamper detection).
  const otherKey = await generateConversationKey();
  let failed = false;
  try {
    await decryptMessage(ciphertext, otherKey);
  } catch {
    failed = true;
  }
  assert(failed, "decryption with a different key fails loudly");

  console.log("\nAll E2EE checks passed ✔");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
