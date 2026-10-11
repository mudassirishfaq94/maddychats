import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EncryptedMessageState } from "../src/components/chats/encrypted-message-state";

const render = (options = {}) => renderToStaticMarkup(createElement(EncryptedMessageState, {
  failed: false, missingKey: false, deviceError: false, signal: false,
  onRetry() {}, onSecurity() {}, ...options,
}));
test("encrypted placeholders explain loading and actionable failure states", () => {
  assert.match(render(), /Loading your message, please wait/);
  assert.match(render(), /aria-busy="true"/);
  const network = render({ failed: true });
  assert.match(network, /Check your connection/);
  assert.match(network, /Try loading again/);
  assert.match(network, /aria-busy="false"/);
  const key = render({ failed: true, missingKey: true });
  assert.match(key, /Restore my other devices/);
  assert.match(key, /cannot be recovered/);
  assert.match(render({ deviceError: true }), /Device settings/);
  assert.match(render({ signal: true }), /ask the sender to resend/);
});
