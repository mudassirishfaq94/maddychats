import { test } from "node:test";
import assert from "node:assert/strict";
import { freshAdminSession } from "../src/lib/admin-session-policy";

test("restricted admin access requires fresh authentication and verified MFA enrollment", () => {
  const now = 1700000000000, enrollment = now - 86400000;
  assert.equal(freshAdminSession(now, enrollment, now), true);
  assert.equal(freshAdminSession(now - 899999, enrollment, now), true);
  for (const time of [0, -1, NaN, Infinity, now + 1, now - 900000, now - 3600000]) assert.equal(freshAdminSession(time, enrollment, now), false);
  for (const proof of [0, -1, NaN, Infinity, now + 1]) assert.equal(freshAdminSession(now, proof, now), false);
});
