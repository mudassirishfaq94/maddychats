import test from "node:test";
import assert from "node:assert/strict";
import { chatLoginDestination, notificationPath } from "../src/lib/notification-navigation";

const chat = "22222222-2222-4222-8222-222222222222";
const message = "44444444-4444-4444-8444-444444444444";

test("a notification tap keeps its conversation through the sign-in page", () => {
  assert.equal(chatLoginDestination(chat), "/login?next=%2Fapp%2Fchats%2F22222222-2222-4222-8222-222222222222");
  assert.equal(
    chatLoginDestination(chat, message),
    "/login?next=%2Fapp%2Fchats%2F22222222-2222-4222-8222-222222222222%3Fmessage%3D44444444-4444-4444-8444-444444444444",
  );
});

test("an untrusted conversation or message id never reaches the sign-in redirect", () => {
  assert.equal(chatLoginDestination("../../evil"), "/login?next=%2Fapp%2Fchats");
  assert.equal(chatLoginDestination(null), "/login?next=%2Fapp%2Fchats");
  assert.equal(chatLoginDestination(chat, "not-a-uuid"), "/login?next=%2Fapp%2Fchats%2F22222222-2222-4222-8222-222222222222");
});

test("only first-party notification paths are allowed", () => {
  const origin = "https://circlo.chat";
  assert.equal(notificationPath(`ziptalks://chat/${chat}?message=${message}`, origin), `/app/chats/${chat}?message=${message}`);
  assert.equal(notificationPath("https://evil.invalid/app/chats", origin), null);
  assert.equal(notificationPath("/app/chats", origin), "/app/chats");
  assert.equal(notificationPath("https://circlo.chat/other", origin), null);
});
