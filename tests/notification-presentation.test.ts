import test from "node:test";
import assert from "node:assert/strict";
import { messageNotificationPresentation } from "../src/lib/notification-presentation";

test("details opt-in shows sender and readable text only when the message is not encrypted", () => {
  assert.deepEqual(messageNotificationPresentation({
    showDetails: true,
    isGroup: false,
    groupName: null,
    actorName: "Ayesha",
    preview: "See you soon",
    encrypted: false,
  }), { title: "Ayesha · Circlo", body: "See you soon" });
});

test("encrypted notification previews never reveal message text", () => {
  assert.deepEqual(messageNotificationPresentation({
    showDetails: true,
    isGroup: false,
    groupName: null,
    actorName: "Ayesha",
    preview: "ciphertext that must remain secret",
    encrypted: true,
  }), { title: "Ayesha · Circlo", body: "New encrypted message. Open Circlo to read it." });
});

test("private notifications suppress both sender and preview", () => {
  assert.deepEqual(messageNotificationPresentation({
    showDetails: false,
    isGroup: false,
    groupName: null,
    actorName: "Ayesha",
    preview: "Private text",
    encrypted: false,
  }), { title: "Circlo", body: "New message. Open Circlo to read it." });
});
