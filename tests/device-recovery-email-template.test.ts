import test from "node:test";
import assert from "node:assert/strict";
import { deviceRecoveryEmail } from "@/server/device-recovery-email-template";

test("device recovery email explains exactly what the one-time code will and will not do", () => {
  const email = deviceRecoveryEmail("012345", "https://circlo.chat");
  assert.match(email.text, /012345/);
  assert.match(email.text, /expires in 10 minutes and works once/i);
  assert.match(email.text, /revoke encryption approval for your other devices/i);
  assert.match(email.text, /cannot restore keys or messages removed when an account was deleted/i);
  assert.match(email.html, /circlo\.chat\/brand\/circlo-email\.png/);
  assert.doesNotMatch(email.html, /<script/i);
});
