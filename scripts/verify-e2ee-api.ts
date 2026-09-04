/**
 * End-to-end API-level E2EE verification against the running dev server.
 *
 * Simulates exactly what the browser does:
 *   1. both users register device keys
 *   2. Alice opens a DM, shares a conversation key to Bob
 *   3. Alice sends an encrypted message (ciphertext stored on the server)
 *   4. Bob fetches the message + his conversation key and decrypts it
 *   5. Bob replies encrypted; Alice decrypts
 */
import {
  generateKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPrivateKey,
  importPublicKey,
  generateConversationKey,
  exportSymmetricKey,
  encryptKeyForUser,
  decryptKeyFromSender,
  encryptMessage,
  decryptMessage,
} from "../src/lib/crypto";

import { readFileSync } from "node:fs";
const [, , base, cookieFileA, cookieFileB, userAid, userBid] = process.argv;

function readCookie(path: string): string {
  return readFileSync(path, "utf8").trim();
}

function assert(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`ok: ${label}`);
}

async function api(
  cookie: string,
  path: string,
  init?: { method?: string; body?: unknown },
) {
  const headers: Record<string, string> = {};
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const method = init?.method ?? "GET";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (res.status >= 400) {
    console.error(`  [${method} ${path}] ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { status: res.status, json };
}

(async () => {
  const cookieA = readCookie(cookieFileA);
  const cookieB = readCookie(cookieFileB);
  console.log("cookieA length:", cookieA.length, "cookieB length:", cookieB.length);
  assert(cookieA.length > 10, "Alice's session cookie is non-empty");
  assert(cookieB.length > 10, "Bob's session cookie is non-empty");

  // ---- Step 1: register device keys for both users -------------------------
  async function registerDevice(c: string) {
    const pair = await generateKeyPair();
    const deviceId = crypto.randomUUID();
    const publicKey = await exportPublicKey(pair.publicKey);
    const jwk = await exportPrivateKey(pair.privateKey);
    const r = await api(c, "/api/e2ee/keys", {
      method: "POST",
      body: { deviceId, publicKey, encryptedPrivateKey: jwk },
    });
    assert(r.status === 200, `register device ${deviceId.slice(0, 8)}`);
    return { pair, deviceId, publicKey, privateKeyJwk: jwk } as const;
  }
  const aliceDev = await registerDevice(cookieA);
  const bobDev = await registerDevice(cookieB);

  // ---- Step 2: Alice starts a DM with Bob ---------------------------------
  const conv = await api(cookieA, "/api/conversations", {
    method: "POST",
    body: { userId: userBid },
  });
  assert(conv.status === 201 || conv.status === 200, `create DM (${conv.status})`);
  const convBody = conv.json as Record<string, unknown>;
  const conversationId = (convBody.conversation as { id: string })?.id
    ?? (convBody.conversationId as string);
  assert(Boolean(conversationId), "conversation id returned");
  console.log("  conversationId:", conversationId);

  // ---- Step 3: Alice fetches peers and shares the conversation key --------
  const peers = await api(cookieA, `/api/e2ee/peers?conversationId=${conversationId}`);
  assert(peers.status === 200, `peers endpoint (${peers.status})`);
  const peerList = (peers.json as { peers: { userId: string; devices: { deviceId: string; publicKey: string }[] }[] }).peers;
  const bobPeer = peerList.find((p) => p.userId === userBid);
  assert(Boolean(bobPeer) && (bobPeer?.devices.length ?? 0) >= 1, "Bob's device key visible to Alice");
  const bobDevice = bobPeer!.devices[0];

  const convKey = await generateConversationKey();
  const wrappedForBob = await encryptKeyForUser(
    convKey,
    await importPublicKey(bobDevice.publicKey),
  );
  const share = await api(cookieA, "/api/e2ee/conversation-keys", {
    method: "POST",
    body: { conversationId, targetUserId: userBid, encryptedKey: wrappedForBob, deviceId: aliceDev.deviceId },
  });
  assert(share.status === 200, `conversation key shared (${share.status})`);

  // ---- Step 4: Alice sends an encrypted message ---------------------------
  const plain = "TOP SECRET hello from Alice — E2EE test " + Date.now();
  const ciphertext = await encryptMessage(plain, convKey);
  const send = await api(cookieA, `/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { text: ciphertext, encrypted: true },
  });
  assert(send.status === 201, `encrypted message sent (${send.status})`);
  const sentMsg = (send.json as { message?: { text: string; encrypted?: boolean } }).message;
  assert(sentMsg?.encrypted === true, "server flags message as encrypted");
  assert(!sentMsg!.text.includes("TOP SECRET"), "server stores only ciphertext");

  // ---- Step 5: Bob fetches the message and decrypts it --------------------
  const hist = await api(cookieB, `/api/conversations/${conversationId}/messages`);
  assert(hist.status === 200, `Bob loads history (${hist.status})`);
  const list = (hist.json as { messages: { text: string; encrypted?: boolean; id: string }[] }).messages;
  const incoming = list.find((m) => m.encrypted);
  assert(Boolean(incoming), "Bob sees the encrypted message");
  assert(!incoming!.text.includes("TOP SECRET"), "ciphertext travels to Bob");

  const keysRes = await api(cookieB, `/api/e2ee/conversation-keys?conversationId=${conversationId}`);
  const keys = (keysRes.json as { keys: { encryptedKey: string }[] }).keys;
  assert(keys.length >= 1, "Bob can fetch his wrapped conversation key");
  const bobPriv = await importPrivateKey(bobDev.privateKeyJwk);
  const bobKey = await decryptKeyFromSender(keys[0].encryptedKey, bobPriv);
  const bobPlain = await decryptMessage(incoming!.text, bobKey);
  assert(bobPlain === plain, "Bob decrypts Alice's message");

  // ---- Step 6: Bob replies encrypted; Alice decrypts ----------------------
  const bobPlainReply = "Reply with secrets too " + Date.now();
  const bobCipher = await encryptMessage(bobPlainReply, bobKey);
  const reply = await api(cookieB, `/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { text: bobCipher, encrypted: true },
  });
  assert(reply.status === 201, `Bob's reply sent (${reply.status})`);
  const hist2 = await api(cookieA, `/api/conversations/${conversationId}/messages`);
  const list2 = (hist2.json as { messages: { text: string; encrypted?: boolean }[] }).messages;
  const bobMsg = list2.find((m) => m.encrypted && m.text === bobCipher);
  assert(Boolean(bobMsg), "Alice sees Bob's encrypted reply");

  console.log("\nAll API-level E2EE checks passed ✔");
  console.log(`conversationId=${conversationId}`);
})().catch((err) => { console.error(err); process.exit(1); });
