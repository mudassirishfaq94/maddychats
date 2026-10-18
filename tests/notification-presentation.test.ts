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
  }), { title: "Ayesha · Circlo", body: "New message received." });
});

test("private notifications suppress both sender and preview", () => {
  assert.deepEqual(messageNotificationPresentation({
    showDetails: false,
    isGroup: false,
    groupName: null,
    actorName: "Ayesha",
    preview: "Private text",
    encrypted: false,
  }), { title: "Circlo", body: "New message received." });
});

test("group alerts name the group and keep the sender with the message", () => {
  assert.deepEqual(messageNotificationPresentation({
    showDetails: true,
    isGroup: true,
    groupName: "Weekend plans",
    actorName: "Ayesha",
    preview: "See you soon",
    encrypted: false,
  }), { title: "Weekend plans · Circlo", body: "Ayesha: See you soon" });
});

test("a long sender name cannot push the brand out of the title", () => {
  const presentation = messageNotificationPresentation({
    showDetails: true,
    isGroup: false,
    groupName: null,
    actorName: "Bartholomew Wolfeschlegelstein",
    preview: "See you soon",
    encrypted: false,
  });
  assert.equal(presentation.title.length <= 80, true);
  assert.equal(presentation.title.endsWith("· Circlo"), true);
  assert.equal(presentation.body, "See you soon");
});
