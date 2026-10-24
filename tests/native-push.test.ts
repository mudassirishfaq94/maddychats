import test from "node:test";
import assert from "node:assert/strict";
import { nativePushPayload } from "../src/lib/native-push-payload";
import { deliverNativePush } from "../src/lib/native-push-delivery";

test("FCM carries private fallback text and routing metadata only", () => {
  const input = { recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "Are you free later?", encrypted: false, encryptionKey: "PRIVATE KEY" };
  const payload = nativePushPayload(input, 1000);
  assert.deepEqual(Object.keys(payload).sort(), ["android", "data"]);
  assert.equal(payload.data.actorName, "Circlo");
  assert.equal(payload.data.preview, "New message. Open Circlo to read it.");
  assert.equal(JSON.stringify(payload).includes("PRIVATE KEY"), false);
  const bounded = nativePushPayload({ ...input, actorName: "Alex\n\u202eFriend", preview: "x".repeat(200) });
  assert.equal(bounded.data.actorName, "Circlo");
  assert.equal(bounded.data.preview, "New message. Open Circlo to read it.");
  assert.equal(payload.data.url, "ziptalks://chat/chat?message=message");
  assert.equal(payload.data.expiresAt, "3601000");
  assert.equal(payload.data.pushSentAtMs, "1000");
  assert.equal(payload.android.ttl, 3600000);
  const privatePayload = nativePushPayload({ ...input, showDetails: false }, 1000);
  assert.equal(privatePayload.data.actorName, "Circlo");
  assert.equal(privatePayload.data.preview, "New message. Open Circlo to read it.");
  assert.equal(JSON.stringify(privatePayload).includes("Alex"), false);
  assert.equal(JSON.stringify(privatePayload).includes("Are you free later?"), false);
  assert.equal(nativePushPayload({ ...input, callId: "call", callTtl: 999 }, 1000).android.ttl, 45000);
  assert.equal(nativePushPayload({ ...input, callId: "call", callTtl: 1, silent: true }, 1000).data.silent, "true");
});

test("remote Android alerts keep message text private when sender details are enabled", () => {
  const input = { recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "Are you free later?", encrypted: false, showDetails: true };
  const payload = nativePushPayload(input, 1000);
  assert.equal(payload.data.title, "Alex · Circlo");
});

test("opted-in Android push carries only a sender name, never message text", () => {
  const input = { recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "Are you free later?", encrypted: true, showDetails: true };
  const payload = nativePushPayload(input, 1000);
  assert.equal(payload.data.actorName, "Alex");
  assert.equal(payload.data.showDetails, "true");
  assert.equal(payload.data.body, "Sent you a message. Open Circlo to read it.");
  assert.equal(JSON.stringify(payload).includes("Are you free later?"), false);
  const request = nativePushPayload({ ...input, messageRequest: true }, 1000);
  assert.equal(request.data.actorName, "Circlo", "Message requests keep the sender private");
  assert.equal(request.data.showDetails, "false");
});

test("a private account still receives the generic alert and no sender", () => {
  const input = { recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "Are you free later?", encrypted: false, showDetails: false };
  const payload = nativePushPayload(input, 1000);
  assert.equal(payload.data.title, "Circlo");
  assert.equal(payload.data.body, "You have a new message. Open Circlo to read it.");
  assert.equal(JSON.stringify(payload).includes("Alex"), false);
  assert.equal(JSON.stringify(payload).includes("Are you free later?"), false);
});

test("encrypted messages never carry their text in the push payload", () => {
  const input = { recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "ciphertext that must stay secret", encrypted: true };
  const payload = nativePushPayload(input, 1000);
  assert.equal(payload.data.title, "Circlo");
  assert.equal(payload.data.body, "You have a new message. Open Circlo to read it.");
  assert.equal(JSON.stringify(payload).includes("ciphertext that must stay secret"), false);
  // An unknown message is treated as encrypted: the preview is never shown.
  const unknown = nativePushPayload({ ...input, encrypted: undefined }, 1000);
  assert.equal(unknown.data.body, "You have a new message. Open Circlo to read it.");
  assert.equal(JSON.stringify(unknown).includes("ciphertext that must stay secret"), false);
});

test("remote group alerts disclose neither group nor sender", () => {
  const payload = nativePushPayload({ recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "Are you free later?", encrypted: false, isGroup: true, groupName: "Weekend plans" }, 1000);
  assert.equal(payload.data.title, "Circlo");
  assert.equal(payload.data.body, "You have a new message. Open Circlo to read it.");
});

test("message kind is safe metadata and controls only the generic remote alert", () => {
  const payload = nativePushPayload({ recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message", actorName: "Alex", preview: "secret text", encrypted: true, showDetails: true, messageKind: "video" }, 1000);
  assert.equal(payload.data.messageKind, "video");
  assert.equal(payload.data.body, "Sent you a video. Open Circlo to watch it.");
  assert.equal(JSON.stringify(payload).includes("secret text"), false);
});

test("a call alert keeps the resolved caller and answer prompt", () => {
  const payload = nativePushPayload({ recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "", callId: "call", title: "Ayesha · Circlo", body: "Incoming audio call. Open Circlo to answer." }, 1000);
  assert.equal(payload.data.title, "Ayesha · Circlo");
  assert.equal(payload.data.body, "Incoming audio call. Open Circlo to answer.");
});

test("native delivery waits for sends, records provider acceptance timing, and retires only invalid tokens", async () => {
  const sent: string[] = [], retired: string[] = [], failed: string[] = [], accepted: number[] = [];
  const payload = nativePushPayload({ recipientId: "recipient", notificationId: "event", conversationId: "chat", messageId: "message" });
  await deliverNativePush(["ok", "invalid", "unregistered", "temporary"].map(token => ({ token })), payload, async message => {
    await new Promise(resolve => setTimeout(resolve, 5));
    sent.push(message.token);
    if (message.token !== "ok") throw { code: message.token === "invalid" ? "messaging/invalid-registration-token" : message.token === "unregistered" ? "messaging/registration-token-not-registered" : "messaging/server-unavailable" };
  }, async token => { retired.push(token); }, code => { failed.push(code); }, elapsed => { accepted.push(elapsed); });
  assert.equal(sent.length, 4);
  assert.equal(accepted.length, 1, "only accepted sends have a provider acceptance time");
  assert(accepted.every(Number.isSafeInteger));
  assert.deepEqual(retired.sort(), ["invalid", "unregistered"]);
  assert.deepEqual(failed, ["messaging/server-unavailable"]);
});

test("native call cancellation is explicit and stays on the data-only short-lived channel",()=>{
 const payload=nativePushPayload({recipientId:"recipient",notificationId:"event",conversationId:"chat",messageId:"",callId:"call",callCancelled:true,callTtl:30},1000);
 assert.equal(payload.data.callId,"call");assert.equal(payload.data.callCancelled,"true");assert.equal(payload.android.ttl,30000);
 assert.equal("notification" in payload,false);
});
