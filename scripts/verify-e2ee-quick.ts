/**
 * Single-file end-to-end E2EE verification.
 * Registers both accounts, creates a DM, and exchanges encrypted messages.
 */
const BASE = "http://localhost:49696";

// ---- Crypto imports ----
import {
  generateKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey,
  importPublicKey, generateConversationKey, exportSymmetricKey,
  encryptKeyForUser, decryptKeyFromSender, encryptMessage, decryptMessage,
} from "../src/lib/crypto";

function assert(cond: boolean, label: string) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exit(1); }
  console.log(`  ok: ${label}`);
}

// Step 0: Register two accounts and extract session cookies
async function register(name: string): Promise<{ id: string; cookie: string; name: string }> {
  const ts = Date.now();
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: name,
      username: `${name.toLowerCase().replace(/\s+/g, "_")}_${ts}`,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}.${ts}@e2ee.local`,
      password: "QaPassword123!",
      confirmPassword: "QaPassword123!",
    }),
  });
  const body = await res.json() as { user: { id: string }; error?: string };
  if (!body.user) throw new Error(`register failed: ${JSON.stringify(body)}`);
  // Get session cookie from response headers
  const cookies = (res.headers as any).getSetCookie?.() ?? [];
  const cookie = cookies
    .map((c: string) => c.split(";")[0])
    .filter((c: string) => c.startsWith("maddy_session="))
    .join("; ");
  if (!cookie) throw new Error(`no session cookie for ${name}`);
  return { id: body.user.id, cookie, name };
}

(async () => {
  const alice = await register("Alice");
  const bob = await register("Bob");
  console.log(`\nAlice: ${alice.id}  Bob: ${bob.id}`);

  // Step 1: Both register device keys
  console.log("\nStep 1: Register device keys");
  async function regKey(user: { cookie: string; id: string; name: string }) {
    const pair = await generateKeyPair();
    const deviceId = crypto.randomUUID();
    const publicKey = await exportPublicKey(pair.publicKey);
    const jwk = await exportPrivateKey(pair.privateKey);
    const res = await fetch(`${BASE}/api/e2ee/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: user.cookie },
      body: JSON.stringify({ deviceId, publicKey, encryptedPrivateKey: jwk }),
    });
    assert(res.status === 200, `register key for ${user.name}`);
    return { deviceId, publicKey, pair, jwk };
  }
  const aliceKey = await regKey(alice);
  const bobKey = await regKey(bob);

  // Step 2: Alice starts DM with Bob
  console.log("\nStep 2: Create DM");
  const dmRes = await fetch(`${BASE}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: alice.cookie },
    body: JSON.stringify({ userId: bob.id }),
  });
  const dmBody = await dmRes.json() as Record<string, unknown>;
  console.log("  DM response:", JSON.stringify(dmBody).slice(0, 200));
  assert(dmRes.ok, `create DM (${dmRes.status})`);
  const cid = (dmBody.conversation as { id: string })?.id
    ?? (dmBody as { conversationId?: string }).conversationId;
  assert(Boolean(cid), "conversation id");
  console.log("  conversationId:", cid);

  // Step 3: Alice shares conversation key to Bob
  console.log("\nStep 3: Share conversation key");
  const peersRes = await fetch(`${BASE}/api/e2ee/peers?conversationId=${cid}`, {
    headers: { Cookie: alice.cookie },
  });
  console.log("  peers status:", peersRes.status);
  const peersBody = await peersRes.json() as { peers: any[] };
  console.log("  peers:", JSON.stringify(peersBody).slice(0, 300));
  assert(peersRes.ok, "peers endpoint");
  assert(peersBody.peers?.length > 0, "has peers");
  assert(peersBody.peers[0].devices?.length > 0, "peer has device keys");

  const convKey = await generateConversationKey();
  const bobPub = await importPublicKey(peersBody.peers[0].devices[0].publicKey);
  const wrapped = await encryptKeyForUser(convKey, bobPub);

  const shareRes = await fetch(`${BASE}/api/e2ee/conversation-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: alice.cookie },
    body: JSON.stringify({
      conversationId: cid,
      targetUserId: bob.id,
      encryptedKey: wrapped,
      deviceId: aliceKey.deviceId,
    }),
  });
  console.log("  share status:", shareRes.status, await shareRes.text());
  assert(shareRes.ok, "share conversation key");

  // Step 4: Alice sends encrypted message
  console.log("\nStep 4: Alice sends encrypted message");
  const secret = "TOP SECRET " + Date.now();
  const cipher = await encryptMessage(secret, convKey);
  const msgRes = await fetch(`${BASE}/api/conversations/${cid}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: alice.cookie },
    body: JSON.stringify({ text: cipher, encrypted: true }),
  });
  assert(msgRes.ok, `send message (${msgRes.status})`);
  const msgBody = await msgRes.json() as { message: { encrypted?: boolean; text: string } };
  assert(msgBody.message.encrypted === true, "server flags encrypted");
  assert(!msgBody.message.text.includes("TOP SECRET"), "no plaintext leak");

  // Step 5: Bob fetches and decrypts
  console.log("\nStep 5: Bob fetches and decrypts");
  const histRes = await fetch(`${BASE}/api/conversations/${cid}/messages`, {
    headers: { Cookie: bob.cookie },
  });
  assert(histRes.ok, "Bob loads history");
  const histBody = await histRes.json() as { messages: { encrypted?: boolean; text: string }[] };
  const encMsg = histBody.messages.find((m) => m.encrypted);
  assert(Boolean(encMsg), "Bob sees encrypted message");
  assert(!encMsg!.text.includes("TOP SECRET"), "ciphertext in transit");

  // Bob decrypts with conversation key
  const bobPriv = await importPrivateKey(bobKey.jwk);
  // First get conversation key from server
  const ckRes = await fetch(`${BASE}/api/e2ee/conversation-keys?conversationId=${cid}`, {
    headers: { Cookie: bob.cookie },
  });
  assert(ckRes.ok, "Bob fetches conversation key");
  const ckBody = await ckRes.json() as { keys: { encryptedKey: string }[] };
  assert(ckBody.keys.length > 0, "conversation key available");
  const sharedKey = await decryptKeyFromSender(ckBody.keys[0].encryptedKey, bobPriv);
  const decrypted = await decryptMessage(encMsg!.text, sharedKey);
  assert(decrypted === secret, "Bob decrypts Alice's message ✓");

  console.log("\n✔ All E2EE checks passed!\n");
})().catch((err) => { console.error(err); process.exit(1); });
