import assert from "node:assert/strict";
import test from "node:test";
import { createPresenceStore } from "../src/lib/presence-store";

test("heartbeats preserve snapshots and another peer's selector identity", () => {
  const store = createPresenceStore();
  let notifications = 0;
  const remove = store.subscribe(() => notifications++);
  store.update("alice", { online: true, lastSeenAt: null });
  const snapshot = store.getSnapshot();
  const alice = snapshot.alice;
  store.update("alice", { online: true, lastSeenAt: null });
  assert.equal(store.getSnapshot(), snapshot);
  assert.equal(notifications, 1);
  store.update("bob", { online: false, lastSeenAt: "2026-10-21T00:00:00Z" });
  assert.equal(store.getSnapshot().alice, alice);
  assert.equal(notifications, 2);
  store.update("alice", { online: false, lastSeenAt: null });
  assert.notEqual(store.getSnapshot().alice, alice);
  remove(); store.clear();
  assert.equal(notifications, 3);
  assert.deepEqual(store.getSnapshot(), {});
});

test("presence stores and server snapshots cannot share one account's users", () => {
  const first = createPresenceStore(), second = createPresenceStore();
  first.update("alice", { online: true, lastSeenAt: null });
  assert.deepEqual(second.getSnapshot(), {});
  assert.deepEqual(first.getServerSnapshot(), {});
  first.clear();
  assert.equal(first.getSnapshot(), first.getServerSnapshot());
});
