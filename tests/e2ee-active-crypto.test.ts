import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { generateConversationKey, encryptMessage, decryptMessage, encryptBytes, decryptBytes, generateKeyPair, encryptKeyForUser, decryptKeyFromSender, exportSymmetricKey, encryptPrivateKeyForStorage, decryptPrivateKeyFromStorage } from "../src/lib/crypto";
import { isCurrentPrivateKeyEnvelope } from "../src/lib/private-key-envelope";

test("active chat cipher randomizes IVs and round-trips Unicode", async () => {
  const key=await generateConversationKey(),text="Private fixture مرحبا 👋";
  const a=await encryptMessage(text,key),b=await encryptMessage(text,key);
  assert.notEqual(a,b);assert.equal(a.includes(text),false);
  assert.equal(await decryptMessage(a,key),text);assert.equal(await decryptMessage(b,key),text);
});

test("active cipher rejects changes to IV, ciphertext and authentication tag",async()=>{
  const key=await generateConversationKey(),sealed=Buffer.from(await encryptMessage("fixture",key),"base64");
  for(const index of [0,12,sealed.length-1]){const changed=Buffer.from(sealed);changed[index]^=1;await assert.rejects(decryptMessage(changed.toString("base64"),key));}
});

test("active cipher rejects wrong keys, malformed base64 and truncated payloads",async()=>{
  const key=await generateConversationKey(),sealed=await encryptMessage("fixture",key);
  await assert.rejects(decryptMessage(sealed,await generateConversationKey()));
  for(const invalid of ["not a valid ciphertext!", "",Buffer.alloc(12).toString("base64"),Buffer.from(sealed,"base64").subarray(0,27).toString("base64")])await assert.rejects(decryptMessage(invalid,key));
});

test("media cipher preserves binary bytes and rejects tampering",async()=>{
  const key=await generateConversationKey(),input=randomBytes(4096),sealed=await encryptBytes(input,key);
  assert.deepEqual(Buffer.from(await decryptBytes(sealed,key)),input);
  const changed=Buffer.from(sealed,"base64");changed[50]^=1;await assert.rejects(decryptBytes(changed.toString("base64"),key));
});

test("conversation-key wrapping is randomized and only its recipient can unwrap",async()=>{
  const key=await generateConversationKey(),recipient=await generateKeyPair(),other=await generateKeyPair();
  const a=await encryptKeyForUser(key,recipient.publicKey),b=await encryptKeyForUser(key,recipient.publicKey);assert.notEqual(a,b);
  assert.equal(await exportSymmetricKey(await decryptKeyFromSender(a,recipient.privateKey)),await exportSymmetricKey(key));
  await assert.rejects(decryptKeyFromSender(a,other.privateKey));
});

test("current backup requires its private factor, not a public device identifier",async()=>{
  const secret=randomBytes(32).toString("hex"),fixture=JSON.stringify({privateFixture:true});
  const sealed=await encryptPrivateKeyForStorage(fixture,secret);
  assert(isCurrentPrivateKeyEnvelope("v2:"+sealed));assert.equal(await decryptPrivateKeyFromStorage(sealed,secret),fixture);
  await assert.rejects(decryptPrivateKeyFromStorage(sealed,"public-device-id"));
  const changed=Buffer.from(sealed,"base64");changed[changed.length-1]^=1;await assert.rejects(decryptPrivateKeyFromStorage(changed.toString("base64"),secret));
});

test("new backup framing rejects legacy, plaintext, placeholders, truncation and oversized input",()=>{
  for(const value of [null,{},"legacy-backup",'{"kty":"RSA","d":"private"}',"v2:placeholder","v2:"+Buffer.alloc(44).toString("base64"),"v2:"+"A".repeat(16384),"v2:"+"A".repeat(59)+"="]){assert.equal(isCurrentPrivateKeyEnvelope(value),false);}
});
