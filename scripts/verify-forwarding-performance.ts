/** Live 10-destination encrypted forwarding benchmark. Temporary QA data is always removed. */
import "dotenv/config";
import { Client } from "pg";
import { mapWithConcurrency } from "../src/lib/async";
import {
  conversationFingerprint,
  decryptKeyFromSender,
  decryptMessage,
  encryptKeyForUser,
  encryptMessage,
  exportPrivateKey,
  exportPublicKey,
  generateConversationKey,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
} from "../src/lib/crypto";

const BASE = process.env.QA_BASE ?? "http://localhost:64395";
const createdUserIds: string[] = [];

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(`FAIL: ${label}`);
}

async function register(label: string, index: number) {
  const suffix = `${Date.now()}_${index}`;
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: label,
      username: `fqa_${index}_${Date.now().toString(36)}`,
      email: `forward.qa.${suffix}@e2ee.local`,
      password: "QaPassword123!",
      confirmPassword: "QaPassword123!",
    }),
  });
  const body = await response.json() as { user?: { id: string }; error?: string };
  assert(response.ok && body.user, body.error ?? `register ${label}`);
  const cookie = ((response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [])
    .map((value) => value.split(";")[0])
    .find((value) => value.startsWith("maddy_session="));
  assert(cookie, `session cookie for ${label}`);
  createdUserIds.push(body.user.id);
  return { id: body.user.id, cookie, label };
}

async function registerDevice(user: Awaited<ReturnType<typeof register>>) {
  const pair = await generateKeyPair();
  const deviceId = crypto.randomUUID();
  const publicKey = await exportPublicKey(pair.publicKey);
  const response = await fetch(`${BASE}/api/e2ee/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: user.cookie },
    body: JSON.stringify({ deviceId, publicKey, encryptedPrivateKey: await exportPrivateKey(pair.privateKey) }),
  });
  assert(response.ok, `device registration for ${user.label}`);
  return { ...user, pair, deviceId, publicKey };
}

void (async () => {
  const accounts = await mapWithConcurrency(
    Array.from({ length: 11 }, (_, index) => index),
    3,
    (index) => register(index === 0 ? "Forward Sender" : `Recipient ${index}`, index),
  );
  const devices = await mapWithConcurrency(accounts, 3, registerDevice);
  const sender = devices[0];
  const recipients = devices.slice(1);
  const conversations = await mapWithConcurrency(recipients, 3, async (recipient) => {
    const response = await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sender.cookie },
      body: JSON.stringify({ userId: recipient.id }),
    });
    const body = await response.json() as { conversation?: { id: string }; error?: string };
    assert(response.ok && body.conversation, body.error ?? "create destination conversation");
    return { recipient, conversationId: body.conversation.id };
  });

  const prepared = await mapWithConcurrency(conversations, 3, async (destination) => {
    const key = await generateConversationKey();
    const encryptedKey = await encryptKeyForUser(key, await importPublicKey(destination.recipient.publicKey));
    const response = await fetch(`${BASE}/api/e2ee/conversation-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sender.cookie },
      body: JSON.stringify({
        conversationId: destination.conversationId,
        targetUserId: destination.recipient.id,
        targetDeviceId: destination.recipient.deviceId,
        encryptedKey,
        keyFingerprint: await conversationFingerprint(key),
        deviceId: sender.deviceId,
      }),
    });
    assert(response.ok, "share destination key");
    return { ...destination, key };
  });

  const sourcePlaintext = `Forward benchmark ${Date.now()}`;
  const startedAt = performance.now();
  const timings = await mapWithConcurrency(prepared, 3, async (destination) => {
    const targetStartedAt = performance.now();
    const response = await fetch(`${BASE}/api/conversations/${destination.conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sender.cookie },
      body: JSON.stringify({
        clientMessageId: crypto.randomUUID(),
        text: await encryptMessage(sourcePlaintext, destination.key),
        forwarded: true,
        encrypted: true,
      }),
    });
    assert(response.ok, "forward destination message");
    return performance.now() - targetStartedAt;
  });
  const totalMs = performance.now() - startedAt;

  await mapWithConcurrency(prepared, 3, async (destination) => {
    const history = await fetch(`${BASE}/api/conversations/${destination.conversationId}/messages`, {
      headers: { Cookie: destination.recipient.cookie },
    });
    const body = await history.json() as { messages?: Array<{ text: string; encrypted: boolean }> };
    const message = body.messages?.find((item) => item.encrypted);
    assert(history.ok && message, "recipient receives encrypted forward");
    const keyResponse = await fetch(
      `${BASE}/api/e2ee/conversation-keys?conversationId=${destination.conversationId}&deviceId=${destination.recipient.deviceId}`,
      { headers: { Cookie: destination.recipient.cookie } },
    );
    const keyBody = await keyResponse.json() as { keys?: Array<{ encryptedKey: string }> };
    assert(keyResponse.ok && keyBody.keys?.[0], "recipient obtains destination key");
    const privateKey = await importPrivateKey(await exportPrivateKey(destination.recipient.pair.privateKey));
    const receivedKey = await decryptKeyFromSender(keyBody.keys[0].encryptedKey, privateKey);
    assert(await decryptMessage(message.text, receivedKey) === sourcePlaintext, "recipient decrypts forward");
  });

  console.log(JSON.stringify({
    destinations: timings.length,
    totalMs: Math.round(totalMs),
    averageRecipientMs: Math.round(timings.reduce((sum, value) => sum + value, 0) / timings.length),
    slowestRecipientMs: Math.round(Math.max(...timings)),
    allEncryptedAndDecryptable: true,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (!createdUserIds.length || !process.env.DATABASE_URL) return;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("delete from users where id = any($1::uuid[])", [createdUserIds]);
  await db.end();
  console.log(`Cleaned up ${createdUserIds.length} temporary QA accounts.`);
});
