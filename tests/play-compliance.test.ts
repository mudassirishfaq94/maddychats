import assert from "node:assert/strict";
import test from "node:test";
import { publicSupportEmail } from "../src/lib/support-contact";
import { requestUserBlock } from "../src/lib/report-block";

test("public support email accepts explicit safe addresses and never creates placeholder or injected mail links", () => {
  for (const value of [undefined, "", "support@example.invalid", "a@b.com\r\nBcc:x@y.com", "javascript:alert(1)", "a@b.com?subject=bad"]) assert.equal(publicSupportEmail(value), null);
  assert.equal(publicSupportEmail("support@circlo.chat"), "support@circlo.chat"); // fixture only, not an asserted mailbox
});

test("a successful report must not hide HTTP or network failure when blocking", async () => {
  let url = "";
  const fake = (status: number) => (async (input: string) => { url = input; return new Response(null, { status }); }) as typeof fetch;
  assert.equal(await requestUserBlock("fixture-user", fake(403)), false);
  assert.equal(await requestUserBlock("fixture-user", fake(503)), false);
  assert.equal(await requestUserBlock("fixture-user", (async () => { throw new Error("offline"); }) as typeof fetch), false);
  assert.equal(await requestUserBlock("fixture-user", fake(200)), true);
  assert.equal(url, "/api/users/fixture-user/block");
});
