import assert from "node:assert/strict";
import { test } from "node:test";
import { createInFlightRead } from "../src/lib/in-flight-read";
import { createReconciledRead } from "../src/lib/reconciled-read";
import { invalidateNotificationPreferences, readNotificationPreferences } from "../src/lib/notification-preference-read";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test("identical pending reads share work only within the same account scope", async () => {
  const reads = createInFlightRead<string>();
  const accountA = {}, accountB = {};
  const a = deferred<string>(), b = deferred<string>();
  let calls = 0;
  const first = reads.run(accountA, () => { calls++; return a.promise; });
  const joined = reads.run(accountA, () => { calls++; return Promise.resolve("wrong"); });
  const otherAccount = reads.run(accountB, () => { calls++; return b.promise; });
  assert.equal(first, joined);
  await Promise.resolve();
  assert.equal(calls, 2);
  a.resolve("account-a"); b.resolve("account-b");
  assert.deepEqual(await Promise.all([first, otherAccount]), ["account-a", "account-b"]);
});

test("invalidated account reads cannot publish after an account switch and can retry", async () => {
  const reads = createInFlightRead<string>();
  const accountA = {}, accountB = {};
  const lateA = deferred<string>();
  const oldRead = reads.run(accountA, () => lateA.promise);
  await Promise.resolve();
  reads.invalidate(accountA);
  const newRead = reads.run(accountB, async () => "account-b");
  lateA.resolve("account-a");
  await assert.rejects(oldRead, /scope changed/i);
  assert.equal(await newRead, "account-b");
  assert.equal(await reads.run(accountA, async () => "fresh-account-a"), "fresh-account-a");
});

test("failed in-flight reads are removed so a later caller retries", async () => {
  const reads = createInFlightRead<number>();
  const scope = {};
  await assert.rejects(reads.run(scope, async () => { throw new Error("offline"); }), /offline/);
  assert.equal(await reads.run(scope, async () => 2), 2);
});

test("notification preference consumers share only a pending account-scoped request", async () => {
  const originalFetch = globalThis.fetch;
  const response = deferred<Response>();
  let calls = 0;
  globalThis.fetch = (() => { calls++; return response.promise; }) as typeof fetch;
  try {
    const accountA = {}, accountB = {};
    const first = readNotificationPreferences(accountA);
    const joined = readNotificationPreferences(accountA);
    const otherAccount = readNotificationPreferences(accountB);
    assert.equal(first, joined);
    await Promise.resolve();
    assert.equal(calls, 2);
    response.resolve({ ok: true, json: async () => ({ preferences: {
      messageNotifications: true, groupNotifications: true, pushNotifications: false,
      notificationSound: false, showNotificationDetails: false,
    } }) } as Response);
    const [preferences] = await Promise.all([first, otherAccount]);
    assert.equal(preferences?.pushNotifications, false);
    await readNotificationPreferences(accountA);
    assert.equal(calls, 3, "settled preferences are fetched again to retain fresh-data behavior");
    const stale = deferred<Response>();
    globalThis.fetch = (() => { calls++; return stale.promise; }) as typeof fetch;
    const obsolete = readNotificationPreferences(accountA);
    await Promise.resolve();
    invalidateNotificationPreferences(accountA);
    stale.resolve({ ok: true, json: async () => ({}) } as Response);
    await assert.rejects(obsolete, /scope changed/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("conversation events during a refresh discard stale data and coalesce follow-up reads", async () => {
  const first = deferred<string>(), followup = deferred<string>();
  let calls = 0, active = 0, maxActive = 0;
  const accepted: string[] = [];
  const reads = createReconciledRead(async () => {
    calls++; active++; maxActive = Math.max(active, maxActive);
    try { return await (calls === 1 ? first.promise : followup.promise); }
    finally { active--; }
  }, value => accepted.push(value));
  reads.start();
  const initial = reads.refresh();
  const joined = reads.refresh();
  assert.equal(initial, joined);
  await Promise.resolve();
  reads.invalidate(); // event/reconnect received during the original request
  assert.equal(reads.pendingIsCurrent, false);
  first.resolve("before-event");
  await initial;
  const afterEvent = reads.refresh();
  const sameBurst = reads.refresh();
  assert.equal(afterEvent, sameBurst);
  await Promise.resolve();
  assert.equal(calls, 2);
  followup.resolve("after-event");
  await afterEvent;
  assert.deepEqual(accepted, ["after-event"]);
  assert.equal(maxActive, 1);
});

test("stopped conversation reads do not accept late data and restart supports Strict Mode", async () => {
  const late = deferred<string>();
  const accepted: string[] = [];
  const reads = createReconciledRead(() => late.promise, value => accepted.push(value));
  reads.start();
  const request = reads.refresh();
  await Promise.resolve();
  reads.stop();
  late.resolve("late");
  await assert.rejects(request, /stopped/i);
  reads.start();
  assert.equal(await reads.refresh(), "late");
  assert.deepEqual(accepted, ["late"]);
});
