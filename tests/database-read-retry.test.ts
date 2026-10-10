import assert from "node:assert/strict";
import test from "node:test";
import { retryDatabaseRead } from "../src/server/database-read-retry";

test("a transient connection failure rereads authorization instead of retaining previous eligibility", async () => {
  let calls = 0;
  const result = await retryDatabaseRead(async () => {
    calls++;
    if (calls === 1) throw new Error("Read failed", { cause: Object.assign(new AggregateError([]), { code: "ETIMEDOUT" }) });
    return null; // The session was revoked before the successful recheck.
  });
  assert.equal(result, null);
  assert.equal(calls, 2);
});

test("persistent connection failures fail closed after one retry", async () => {
  let calls = 0;
  const failure = Object.assign(new Error("Connection lost"), { code: "ECONNRESET" });
  await assert.rejects(retryDatabaseRead(async () => { calls++; throw failure; }), error => error === failure);
  assert.equal(calls, 2);
});

test("nonconnection errors are returned immediately without replay", async () => {
  let calls = 0;
  const failure = Object.assign(new Error("Permission denied"), { code: "42501" });
  await assert.rejects(retryDatabaseRead(async () => { calls++; throw failure; }), error => error === failure);
  assert.equal(calls, 1);
});
