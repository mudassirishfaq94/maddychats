import test from "node:test";
import assert from "node:assert/strict";
import { validAnswerGrant, consumeCallAnswer } from "../src/lib/call-answer-grant";

test("notification Answer proof is recipient bound, expiring and distinct from an ordinary deep link", async () => {
  const grant = { recipientId: "recipient", token: "nonce", expiresAt: 15000 };
  assert.equal(validAnswerGrant(grant, "recipient", "nonce", 1000), true);
  assert.equal(validAnswerGrant(grant, "other", "nonce", 1000), false);
  assert.equal(validAnswerGrant(grant, "recipient", "forged", 1000), false);
  assert.equal(validAnswerGrant(grant, "recipient", "nonce", 15000), false);
  assert.equal(validAnswerGrant({ ...grant, expiresAt: 999999 }, "recipient", "nonce", 1000), false);
  assert.equal(await consumeCallAnswer("recipient", "call", null), false);
});
