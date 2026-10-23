import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EncryptedMessageState } from "../src/components/chats/encrypted-message-state";

const render = (options = {}) => renderToStaticMarkup(createElement(EncryptedMessageState, {
  failed: false, missingKey: false, deviceError: false, signal: false,
  onRetry() {}, onSecurity() {}, ...options,
}));
test("encrypted messages hide transient decryption state and keep actionable failures", () => {
  assert.equal(render(), "");
  assert.equal(render({kind:"image"}), "");
  assert.equal(render({kind:"video"}), "");
  assert.match(render({ introduction: true }), /Waiting/);
  const network = render({ failed: true });
  assert.match(network, /Check your connection/);
  assert.match(network, /Tap to retry/);
  assert.match(network, /aria-busy="false"/);
  const key = render({ failed: true, missingKey: true });
  assert.match(key, /can&#x27;t be opened on this phone/);
  assert.match(key, /already read this chat/);
  assert.match(render({ deviceError: true }), /Open settings/);
  assert.match(render({ signal: true }), /send it again/);
  assert.match(render({ failed: true, introduction: true }), /when they open Circlo/);
});
