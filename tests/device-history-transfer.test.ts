import { test } from "node:test";
import assert from "node:assert/strict";
import { transferDeviceHistory } from "../src/lib/device-history-transfer";

test("linked-device history transfer attempts every chat beyond the old 100-chat cap", async () => {
  const ids = Array.from({ length: 137 }, (_, index) => `chat-${index + 1}`);
  const attempted = new Set<string>();
  const progress: Array<[number, number]> = [];
  let active = 0;
  let peakActive = 0;
  const result = await transferDeviceHistory(ids, async id => {
    attempted.add(id);
    active++;
    peakActive = Math.max(peakActive, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    if (id === "chat-4" || id === "chat-89") throw new Error("source phone cannot open this chat");
  }, (completed, total) => progress.push([completed, total]));

  assert.equal(attempted.size, 137);
  assert.equal(result.total, 137);
  assert.equal(result.sent, 135);
  assert.equal(progress.length, 137);
  assert.deepEqual(progress.at(-1), [137, 137]);
  assert.ok(peakActive <= 3, "history transfer must keep bounded concurrency");
});
