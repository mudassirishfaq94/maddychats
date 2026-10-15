import test from "node:test";
import assert from "node:assert/strict";
import { discoveryPhone } from "../src/lib/phone-numbers";
test("contact discovery needs an explicit country context and never rewrites a complete international number", () => {
  assert.equal(discoveryPhone("0300 1234567"),null);
  assert.equal(discoveryPhone("0300 1234567","+92"),"+923001234567");
  assert.equal(discoveryPhone("020 7946 0123","+44"),"+442079460123");
  assert.equal(discoveryPhone("+39 02 12345678","+92"),"+390212345678");
  assert.equal(discoveryPhone("00971 50 1234567"),"+971501234567");
  for (const input of ["+123","+000123456789","+1234567890123456","+15551234567 ext 99","<script>","+1555%123456"]) assert.equal(discoveryPhone(input),null);
});
