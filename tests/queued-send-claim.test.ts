import assert from "node:assert/strict";
import test from "node:test";
import { claimQueuedSend } from "../src/lib/queued-send-claim";

test("chat retry and app-wide drain cannot claim the same pending send concurrently", () => {
  const release = claimQueuedSend("account", "message");
  assert(release);
  assert.equal(claimQueuedSend("account", "message"), null);
  release();
  const next = claimQueuedSend("account", "message");
  assert(next);
  release(); // A stale completion must not release a newer retry.
  assert.equal(claimQueuedSend("account", "message"), null);
  next();
});

test("unrelated queued messages and accounts do not block each other", () => {
  const releases = [claimQueuedSend("a", "one"), claimQueuedSend("a", "two"), claimQueuedSend("b", "one")];
  assert(releases.every(Boolean));
  for (const release of releases) release?.();
});
