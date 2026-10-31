import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EncryptedMessageState } from "../src/components/chats/encrypted-message-state";

const render = (options = {}) => renderToStaticMarkup(createElement(EncryptedMessageState, {
  failed: false, missingKey: false, deviceError: false, signal: false,
  onRetry() {}, onSecurity() {}, ...options,
}));
test("encrypted messages show a calm loading state and explain failures in plain language", () => {
  assert.match(render(), /Opening/);
  assert.match(render({kind:"image"}), /Opening/);
  assert.match(render({kind:"video"}), /Opening/);
  assert.match(render({ introduction: true }), /Waiting/);
  const network = render({ failed: true });
  assert.match(network, /Couldn&#x27;t open this message/);
  assert.match(network, /Check your connection/);
  assert.match(network, /Try again/);
  assert.match(network, /aria-busy="false"/);
  const key = render({ failed: true, missingKey: true });
  assert.match(key, /Message unavailable/);
  assert.match(key, /Link the phone that can still open it and send its chat history/);
  assert.match(key, /How to bring chats over/);
  assert.doesNotMatch(key, /recovery key|decrypt|trusted device/i);
  assert.match(render({ deviceError: true }), /Open settings/);
  assert.match(render({ signal: true }), /needs an update.*send it again/);
  assert.match(render({ failed: true, introduction: true }), /when they open Circlo/);
});

test("missing chat history offers the exact recovery button only in the appropriate failure state", () => {
  const buttonLabels = (markup: string) => Array.from(
    markup.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g),
    match => match[1],
  );

  const missingHistory = buttonLabels(render({ failed: true, missingKey: true }));
  assert.deepEqual(missingHistory, ["Try again", "How to bring chats over"]);
  assert.equal(missingHistory.includes("Recovery help"), false);

  assert.deepEqual(buttonLabels(render()), []);
  assert.deepEqual(buttonLabels(render({ failed: true })), ["Try again", "Message help"]);
  assert.deepEqual(buttonLabels(render({ failed: true, missingKey: true, deviceError: true })), ["Open settings"]);
  assert.deepEqual(buttonLabels(render({ failed: true, missingKey: true, signal: true })), ["Message help"]);
});
