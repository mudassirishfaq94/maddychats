import { test } from "node:test";
import assert from "node:assert/strict";
import bcryptjs from "bcryptjs";
import { hashPassword, verifyPassword, PasswordBusyError } from "../src/server/password";
import { withPasswordCapacity } from "../src/server/password-capacity";

test("capacity exhaustion is retryable and never authenticates or masks unrelated errors", async () => {
  const response = await withPasswordCapacity(async () => { throw new PasswordBusyError(); })();
  assert.equal(response.status,503);
  assert.equal(response.headers.get("Retry-After"),"5");
  assert.equal(response.headers.get("Cache-Control"),"no-store");
  assert.equal(response.cookies.getAll().length,0);
  const failure=new Error("database failure");
  await assert.rejects(withPasswordCapacity(async () => { throw failure; })(),error=>error===failure);
});

test("native password worker preserves existing hashes and cost without blocking timers", async () => {
  const password = "WorkerCompatibility99!";
  const oldHash = await bcryptjs.hash(password, 12);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    assert.equal(await verifyPassword(password, oldHash), true);
    assert.equal(await verifyPassword("incorrect", oldHash), false);
    const hash = await hashPassword(password);
    assert.equal(bcryptjs.getRounds(hash), 12);
    assert.equal(await bcryptjs.compare(password, hash), true);
    assert(ticks > 5);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => verifyPassword(password, oldHash)));
    assert(results.some(r => r.status === "rejected" && r.reason instanceof PasswordBusyError));
    assert(results.every(r => r.status === "rejected" || r.value === true));
    assert.equal(await verifyPassword(password, oldHash), true, "capacity recovers after rejection");
  } finally { clearInterval(timer); }
});
