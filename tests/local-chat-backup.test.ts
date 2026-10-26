import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backupCode, backupKey, backupEligible, openChatBackup, sealChatBackup, validateChatBackup, type ChatBackup } from "../src/lib/local-chat-backup";
import { generateKeyPair, exportPrivateKey, exportPublicKey, encryptPrivateKeyForStorage, generateConversationKey, encryptKeyForUser, decryptKeyFromSender, conversationFingerprint, encryptMessage, decryptMessage } from "../src/lib/crypto";
import { latestSendingKey, rewrapRecoveryHistory, storedChatKeys, commitRecoveredHistory } from "../src/lib/device-recovery-file";
import { collectChatBackup } from "../src/lib/local-chat-backup-store";
import type { MessageDTO } from "../src/lib/types";

test("history imports preserve sending keys and roll back failed key or archive writes", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), userId = randomUUID();
  const values = new Map<string, string>(); let fail = "";
  const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { if (key === fail) { fail = ""; throw new Error("storage full"); } values.set(key, value); }, removeItem: (key: string) => values.delete(key) };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store });
  try {
    const active = { fingerprint: "same", wrapped: "live" }, old = { fingerprint: "same", wrapped: "old", historical: true };
    values.set("chat", JSON.stringify([active]));
    values.set(`e2ee_restored_${userId}`, JSON.stringify({ keys: { chat: JSON.stringify([old]) } }));
    assert.deepEqual(storedChatKeys(userId, "chat"), [active]);
    values.delete(`e2ee_restored_${userId}`);
    const before = new Map(values), recovered = { chat: [{ fingerprint: "history", wrapped: "wrap", historical: true }], other: [old] };
    let published = false;
    fail = "other";
    await assert.rejects(commitRecoveredHistory(userId, recovered, async () => { published = true; }, new AbortController().signal), /storage full/);
    assert.equal(published, false); assert.deepEqual(values, before);
    await assert.rejects(commitRecoveredHistory(userId, recovered, async () => { throw new Error("archive quota"); }, new AbortController().signal), /archive quota/);
    assert.deepEqual(values, before);
    await commitRecoveredHistory(userId, recovered, async () => { assert.equal(storedChatKeys(userId, "chat").length, 2); published = true; }, new AbortController().signal);
    assert.equal(published, true); assert.equal(latestSendingKey(storedChatKeys(userId, "chat"))?.wrapped, "live");
  } finally { if (original) Object.defineProperty(globalThis, "localStorage", original); else Reflect.deleteProperty(globalThis, "localStorage"); }
});

async function fixture(): Promise<ChatBackup> {
  const userId = randomUUID(), secret = "a".repeat(64), pair = await generateKeyPair();
  return { format: "circlo-chats-v1", userId, createdAt: new Date().toISOString(), recovery: { version: 1, userId, deviceId: "original-device", secret, keypair: JSON.stringify({ publicKey: await exportPublicKey(pair.publicKey), encryptedPrivateKey: "v2:" + await encryptPrivateKeyForStorage(await exportPrivateKey(pair.privateKey), secret) }), keys: {} }, chats: [{ id: randomUUID(), name: "Private chat", messages: [{ id: randomUUID(), senderId: userId, senderName: "Private sender", createdAt: new Date().toISOString(), text: "Private backup content", attachments: [] }] }], calls: [], missingMedia: 0, unreadableMessages: 0 };
}
test("portable local chat archives authenticate the entire snapshot, account and recovery identity", async () => {
  const snapshot = await fixture(), code = backupCode(), key = await backupKey(code);
  assert.equal(key.extractable, false);
  const file = await sealChatBackup(snapshot, key);
  assert(!Buffer.from(await file.arrayBuffer()).includes(Buffer.from("Private backup content")));
  assert.deepEqual(await openChatBackup(file, await backupKey(code), snapshot.userId), snapshot);
  await assert.rejects(openChatBackup(file, await backupKey(backupCode()), snapshot.userId), /incorrect/);
  await assert.rejects(openChatBackup(file, key, randomUUID()), /account/);
  const bytes = new Uint8Array(await file.arrayBuffer()); bytes[bytes.length - 1] ^= 1;
  await assert.rejects(openChatBackup(new Blob([bytes]), key, snapshot.userId), /damaged/);
  await assert.rejects(backupKey("easy-password"), /complete saved backup code/);
  await assert.rejects(openChatBackup(new Blob(["{}"]), key, snapshot.userId), /incomplete/);
  await assert.rejects(validateChatBackup({ ...snapshot, recovery: { ...snapshot.recovery, userId: randomUUID() } }, snapshot.userId), /signed-in account/);
});
test("local archives exclude temporary, deleted, pending and self-destruct messages", () => {
  const regular = { deletedAt: null, deletedForMe: false, selfDestruct: false, expiresAt: null } as MessageDTO;
  assert.equal(backupEligible(regular), true);
  for (const patch of [{ deletedAt: new Date().toISOString() }, { deletedForMe: true }, { selfDestruct: true }, { expiresAt: new Date(Date.now() + 60000).toISOString() }, { sendStatus: "queued" }]) {
    assert.equal(backupEligible({ ...regular, ...patch } as MessageDTO), false);
  }
});
test("restored archive media metadata cannot expose active browser documents", async () => {
  const snapshot = await fixture();
  snapshot.chats[0].messages[0].attachments = [{ id: randomUUID(), originalName: "disguised.pdf", mimeType: "Text/HTML; charset=utf-8", size: 10, kind: "file", encrypted: true, encKey: "wrapped", data: "AAAA" }];
  await assert.rejects(validateChatBackup(snapshot, snapshot.userId), /safely/);
});

test("recovery rewraps historical keys to the current device without replacing its sending key", async () => {
  const snapshot = await fixture(), other = await generateKeyPair(), oldKey = await generateConversationKey();
  const pair = JSON.parse(snapshot.recovery.keypair), storageKey = `e2ee_sentkeys_${snapshot.userId}_${snapshot.chats[0].id}`;
  const { importPublicKey } = await import("../src/lib/crypto");
  snapshot.recovery.keys[storageKey] = JSON.stringify([{ fingerprint: await conversationFingerprint(oldKey), wrapped: await encryptKeyForUser(oldKey, await importPublicKey(pair.publicKey)) }]);
  const restored = await rewrapRecoveryHistory(snapshot.recovery, snapshot.userId, await exportPublicKey(other.publicKey));
  assert.equal(restored[storageKey][0].historical, true);
  const recoveredKey = await decryptKeyFromSender(restored[storageKey][0].wrapped, other.privateKey);
  assert.equal(await decryptMessage(await encryptMessage("retained old history", oldKey), recoveredKey), "retained old history");
  assert.equal(latestSendingKey(restored[storageKey]), undefined, "An archived group key can never become a sending key");
  const current = { fingerprint: "current", wrapped: "current-wrap" };
  assert.equal(latestSendingKey([...restored[storageKey], current]), current);
});

test("backup collection paginates history and rejects account changes without publishing a snapshot", async () => {
  const snapshot = await fixture(), chat = snapshot.chats[0];
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), originalFetch = globalThis.fetch;
  const values = new Map<string, string>([[`e2ee_keypair_${snapshot.userId}`, snapshot.recovery.keypair], [`e2ee_recovery_${snapshot.userId}_original-device`, snapshot.recovery.secret]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null } });
  let switched = false, accountReads = 0, pages = 0, mediaReads = 0;
  const attachmentId = randomUUID();
  globalThis.fetch = async input => {
    const path = String(input);
    if (path === "/api/auth/me") return Response.json({ user: { id: ++accountReads > 1 && switched ? randomUUID() : snapshot.userId } });
    if (path === "/api/conversations") return Response.json({ viewerId: snapshot.userId, conversations: [{ id: chat.id, name: "Saved chat" }] });
    if (path === `/api/conversations/${chat.id}`) return Response.json({ conversation: { disappearingSeconds: 0 } });
    if (path.startsWith(`/api/conversations/${chat.id}/messages`)) {
      pages++;
      const older = path.includes("cursor=");
      return Response.json({ messages: [{ ...chat.messages[0], id: randomUUID(), sender: { displayName: "Sender" }, encrypted: false, attachments: [{ id: attachmentId, originalName: "note.txt", mimeType: "text/plain", size: 5, kind: "file", encrypted: false, encKey: null, url: "https://untrusted.invalid/file" }] }, { ...chat.messages[0], id: randomUUID(), sender: { displayName: "Sender" }, selfDestruct: true }], hasMore: !older, nextCursor: older ? null : "older-page" });
    }
    if (path === `/api/media/${attachmentId}`) { mediaReads++; return new Response("hello"); }
    if (path === "/api/calls/history") return Response.json({ calls: [], nextCursor: null });
    throw new Error("Unexpected test request");
  };
  try {
    const input = { userId: snapshot.userId, deviceId: "original-device", signal: new AbortController().signal, decrypt: async (text: string) => text };
    const result = await collectChatBackup(input);
    assert.equal(pages, 2); assert.equal(result.chats[0].messages.length, 2);
    assert.equal(mediaReads, 2); assert.equal(result.missingMedia, 0);
    assert.equal(result.chats[0].messages[0].attachments[0].data, Buffer.from("hello").toString("base64"), "Saved media bytes come only from the authorized same-origin endpoint");
    switched = true; accountReads = 0;
    await assert.rejects(collectChatBackup(input), /Account changed/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(collectChatBackup({ ...input, signal: controller.signal }), /abort/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage); else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
