import test from "node:test";
import assert from "node:assert/strict";
import { nativePushPayload } from "../src/lib/native-push-payload";
import { deliverNativePush } from "../src/lib/native-push-delivery";

test("FCM payload carries bounded presentation text and routing metadata in a data-only delivery", () => {
  const input = { recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "Are you free later?", encryptionKey: "PRIVATE KEY" };
  const payload = nativePushPayload(input, 1000);
  assert.deepEqual(Object.keys(payload).sort(), ["android", "data"]);
  assert.equal(payload.data.actorName, "Alex");
  assert.equal(payload.data.preview, "Are you free later?");
  assert.equal(JSON.stringify(payload).includes("PRIVATE KEY"), false);
  const bounded = nativePushPayload({ ...input, actorName: "Alex\n\u202eFriend", preview: "x".repeat(200) });
  assert.equal(bounded.data.actorName, "Alex Friend");
  assert.equal(bounded.data.preview.length, 140);
  assert.equal(payload.data.url, "ziptalks://chat/chat?message=message");
  assert.equal(payload.data.expiresAt, "3601000");
  assert.equal(payload.android.ttl, 3600000);
  const privatePayload = nativePushPayload({ ...input, showDetails: false }, 1000);
  assert.equal(privatePayload.data.actorName, "Circlo");
  assert.equal(privatePayload.data.preview, "New message. Open Circlo to read it.");
  assert.equal(JSON.stringify(privatePayload).includes("Alex"), false);
  assert.equal(JSON.stringify(privatePayload).includes("Are you free later?"), false);
  assert.equal(nativePushPayload({ ...input, callId: "call", callTtl: 999 }, 1000).android.ttl, 45000);
  assert.equal(nativePushPayload({ ...input, callId: "call", callTtl: 1, silent: true }, 1000).data.silent, "true");
});

test("native delivery waits for sends and retires only invalid/unregistered tokens", async () => {
  const sent: string[] = [], retired: string[] = [], failed: string[] = [];
  const payload = nativePushPayload({ recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message" });
  await deliverNativePush(["ok", "invalid", "unregistered", "temporary"].map(token => ({ token })), payload, async message => {
    await new Promise(resolve => setTimeout(resolve, 5));
    sent.push(message.token);
    if (message.token !== "ok") throw { code: message.token === "invalid" ? "messaging/invalid-registration-token" : message.token === "unregistered" ? "messaging/registration-token-not-registered" : "messaging/server-unavailable" };
  }, async token => { retired.push(token); }, code => { failed.push(code); });
  assert.equal(sent.length, 4);
  assert.deepEqual(retired.sort(), ["invalid", "unregistered"]);
  assert.deepEqual(failed, ["messaging/server-unavailable"]);
});
