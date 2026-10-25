import test from "node:test";
import assert from "node:assert/strict";
import { notificationChatLocked, resolveLocalNotification } from "../src/lib/local-notification-preview";

const notice = "11111111-1111-4111-8111-111111111111";
const chat = "22222222-2222-4222-8222-222222222222";
test("recipient-only previews follow the setting across locked chats and require successful local decryption", async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let locks = "[]";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => locks } });
  let detail: Record<string, unknown> = { recipientId: "viewer", conversationId: chat, messageId: notice, previewAllowed: true, encrypted: true, ciphertext: "opaque", actorName: "Alex", isGroup: false };
  globalThis.fetch = async () => new Response(JSON.stringify(detail));
  let decryptions = 0;
  const decrypt = async (ciphertext: string) => { assert.equal(ciphertext, "opaque"); decryptions++; return "Are we meeting tonight?"; };
  const resolve = (fn = decrypt, active = () => true) => resolveLocalNotification(notice, "viewer", fn, active);
  try {
    assert.equal((await resolve())?.body, "Are we meeting tonight?");
    assert.equal((await resolve())?.messageText, "Are we meeting tonight?");
    assert.equal((await resolve())?.senderName, "Alex");
    detail.isGroup = true; detail.groupName = "Weekend";
    assert.equal((await resolve())?.body, "Alex: Are we meeting tonight?");
    locks = JSON.stringify([chat]); decryptions = 0;
    assert.equal((await resolve())?.body, "Alex: Are we meeting tonight?");
    assert.equal(decryptions, 1, "chat-lock UI state does not suppress an opted-in notification preview");
    locks = "[]"; detail.messageRequest = true;
    assert.equal((await resolve())?.title, "Alex · Circlo");
    assert.equal((await resolve())?.body, "Are we meeting tonight?");
    assert.equal(decryptions, 3, "opted-in message requests are decrypted on the recipient device");
    detail.messageRequest = false; detail.previewAllowed = false; decryptions = 0;
    assert.equal((await resolve())?.title, "Circlo"); assert.equal(decryptions, 0);
    detail.previewAllowed = true;
    assert.equal((await resolve(async () => { throw new Error("no key"); }))?.title, "Circlo");
    assert.equal((await resolve(async () => { locks = JSON.stringify([chat]); return "must not escape"; }))?.body, "Alex: must not escape");
    locks = "broken"; assert.equal(notificationChatLocked(chat), true);
    locks = "[]";
    assert.equal(await resolve(decrypt, () => false), null);
    detail.recipientId = "other"; assert.equal(await resolve(), null);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
