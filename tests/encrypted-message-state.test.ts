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
  assert.match(key, /device that can still open this chat/);
  assert.match(key, /may not be recoverable/);
  assert.doesNotMatch(key, /key|decrypt|trusted device/i);
  assert.match(render({ deviceError: true }), /Open settings/);
  assert.match(render({ signal: true }), /needs an update.*send it again/);
  assert.match(render({ failed: true, introduction: true }), /when they open Circlo/);
});
