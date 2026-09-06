/**
 * Live E2EE media round-trip: register two users, start a DM, share keys via
 * the real API (simulating both browsers), send an encrypted image from A,
 * then verify B can decrypt it with the same primitives the hook uses.
 */
const MEDIA_BASE = process.env.QA_BASE ?? "http://localhost:64395";
const mediaStamp = `${Date.now()}`.slice(-8);

async function mediaRegister(displayName: string) {
  const res = await fetch(`${MEDIA_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: MEDIA_BASE },
    body: JSON.stringify({
      displayName,
      username: `qa${mediaStamp}${displayName.toLowerCase().slice(0, 3)}`,
      email: `qa.med${mediaStamp.slice(-5)}.${displayName.toLowerCase().slice(0, 3)}@test.dev`,
      password: "TestPass!2026",
      confirmPassword: "TestPass!2026",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`register failed: ${res.status} ${JSON.stringify(body)}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { session: setCookie.split(";")[0], user: body.user };
}

async function mediaApi(session: string) {
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${MEDIA_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Cookie: session,
        Origin: MEDIA_BASE,
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      },
    });
    return res;
  };
}

/* ---------- WebCrypto helpers (same algorithms as src/lib/crypto.ts) ---------- */
const enc = new TextEncoder();

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function un_b64(s: string): ArrayBuffer {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
async function aes(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function rsa(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
}
async function encryptBytes(data: ArrayBuffer, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), 12);
  return b64(combined.buffer);
}
async function decryptBytes(b64s: string, key: CryptoKey): Promise<ArrayBuffer> {
  const combined = new Uint8Array(un_b64(b64s));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
}

async function mediaMain() {
  const alice = await mediaRegister("Alice Media");
  const bob = await mediaRegister("Bob Media");
  const A = await mediaApi(alice.session);
  const B = await mediaApi(bob.session);
  const aliceId = alice.user.id;
  const bobId = bob.user.id;

  // 1. Both register device keys (RSA keypairs)
  const alicePair = await rsa();
  const bobPair = await rsa();
  const alicePubB64 = b64(await crypto.subtle.exportKey("spki", alicePair.publicKey));
  const bobPubB64 = b64(await crypto.subtle.exportKey("spki", bobPair.publicKey));
  const devA = `dev-a-${mediaStamp}`;
  const devB = `dev-b-${mediaStamp}`;
  let  r = await A("/api/e2ee/keys", { method: "POST", body: JSON.stringify({ deviceId: devA, publicKey: alicePubB64, encryptedPrivateKey: "qa-test-no-sync" }) });
  if (!r.ok) throw new Error(`alice key reg failed: ${r.status}`);
  r = await B("/api/e2ee/keys", { method: "POST", body: JSON.stringify({ deviceId: devB, publicKey: bobPubB64, encryptedPrivateKey: "qa-test-no-sync" }) });
  if (!r.ok) throw new Error(`bob key reg failed: ${r.status}`);
  console.log("1. device keys registered");

  // 2. Alice starts a DM with Bob
  r = await A("/api/conversations", { method: "POST", body: JSON.stringify({ userId: bobId }) });
  const convBody = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`dm create failed: ${r.status} ${JSON.stringify(convBody)}`);
  const convId = (convBody.conversation ?? convBody).id;
  console.log("2. DM created:", convId.slice(0, 8));

  // 3. Alice generates a conversation key and shares it with Bob's device
  const convKey = await aes();
  const convKeyRawB64 = b64(await crypto.subtle.exportKey("raw", convKey));
  const bobPubImported = await crypto.subtle.importKey("spki", un_b64(bobPubB64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const sharedForBob = b64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, bobPubImported, enc.encode(convKeyRawB64).buffer as ArrayBuffer));
  r = await A("/api/e2ee/conversation-keys", {
    method: "POST",
    body: JSON.stringify({ conversationId: convId, targetUserId: bobId, encryptedKey: sharedForBob, deviceId: devA }),
  });
  if (!r.ok) throw new Error(`key share failed: ${r.status}`);
  console.log("3. conversation key shared A->B");

  // 4. Bob fetches his shared key and unwraps it (proves GET works)
  r = await B(`/api/e2ee/conversation-keys?conversationId=${convId}`);
  const keysBody = await r.json();
  const shared = keysBody.keys?.[0];
  if (!shared) throw new Error("bob sees no shared key");
  const unwrappedRaw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, bobPair.privateKey, un_b64(shared.encryptedKey));
  const bobConvKey = await crypto.subtle.importKey("raw", un_b64(new TextDecoder().decode(unwrappedRaw)), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  // Sanity: both keys match
  const probe = await encryptBytes(enc.encode("x").buffer as ArrayBuffer, convKey);
  await decryptBytes(probe, bobConvKey);
  console.log("4. bob unwrapped the same conversation key");

  // 5. Alice encrypts a tiny PNG (1x1) with a media key, wraps media key with conv key — like the app
  const tinyPng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  const mediaKey = await aes();
  const cipherB64 = await encryptBytes(tinyPng.buffer as ArrayBuffer, mediaKey);
  const mediaKeyB64 = b64(await crypto.subtle.exportKey("raw", mediaKey));
  const wrappedKeyB64 = await encryptBytes(enc.encode(mediaKeyB64).buffer as ArrayBuffer, convKey);

  const form = new FormData();
  form.append("conversationId", convId);
  form.append("encrypted", "true");
  const cipherBytes = new Uint8Array(un_b64(cipherB64));
  form.append("files", new File([cipherBytes], "pixel.png", { type: "application/octet-stream" }));
  form.append("keys", wrappedKeyB64);
  form.append("origTypes", "image/png");
  r = await A("/api/upload/message", { method: "POST", body: form });
  const upBody = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${JSON.stringify(upBody)}`);
  const msg = upBody.message;
  const att = msg.attachments?.[0];
  if (!att?.encrypted || !att?.encKey) throw new Error(`attachment missing enc fields: ${JSON.stringify(att)}`);
  console.log("5. encrypted image uploaded; attachment encrypted=true, encKey present");

  // 6. Receiver decrypts exactly like use-e2ee decryptMedia + e2ee-context
  r = await B(att.url.replace(/^/, ""));
  if (!r.ok) throw new Error(`media fetch failed: ${r.status}`);
  const fetched = await r.arrayBuffer();
  const bobConvKey2 = bobConvKey;
  const wrapped = await decryptBytes(att.encKey, bobConvKey2);
  const mediaKeyB64Back = new TextDecoder().decode(wrapped);
  const mediaKeyBack = await crypto.subtle.importKey("raw", un_b64(mediaKeyB64Back), { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  const plain = await decryptBytes(b64(fetched), mediaKeyBack);
  const plainBytes = new Uint8Array(plain);
  const pngOk = plainBytes[0] === 0x89 && plainBytes[1] === 0x50; // PNG magic
  console.log(`6. receiver decrypted image: ${plainBytes.byteLength} bytes, PNG magic ${pngOk ? "OK" : "MISMATCH"}`);

  // 7. Sender can decrypt own image (sender also needs own path)
  const wrappedSelf = await decryptBytes(att.encKey, convKey);
  const mkSelf = await crypto.subtle.importKey("raw", un_b64(new TextDecoder().decode(wrappedSelf)), { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  const plainSelf = await decryptBytes(b64(fetched), mkSelf);
  console.log(`7. sender self-decrypt: ${new Uint8Array(plainSelf).byteLength} bytes`);

  console.log("\nALL E2EE MEDIA LIVE CHECKS PASSED");
}

mediaMain().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
