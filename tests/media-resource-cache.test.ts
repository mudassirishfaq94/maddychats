import assert from "node:assert/strict";
import test from "node:test";
import { createMediaWorkQueue } from "../src/lib/media-work-queue";
import { createMediaResourceCache } from "../src/lib/media-resource-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("media queue bounds active work and cancels a queued download", async () => {
  const queue = createMediaWorkQueue(2);
  const first = deferred<void>(), second = deferred<void>();
  const cancel = new AbortController();
  let active = 0, peak = 0, cancelledRan = false;
  const run = (wait: Promise<void>) => queue.run(new AbortController().signal, async () => {
    active++; peak = Math.max(peak, active); await wait; active--;
  });
  const a = run(first.promise), b = run(second.promise);
  const c = queue.run(cancel.signal, async () => { cancelledRan = true; });
  const rejected = assert.rejects(c);
  cancel.abort(); await tick();
  assert.equal(peak, 2); assert.equal(cancelledRan, false);
  first.resolve(); second.resolve(); await Promise.all([a, b, rejected]);
});

test("shared media survives one consumer cancellation and loads once", async () => {
  let loads = 0;
  const ready = deferred<Blob>();
  const revoked: string[] = [];
  const cache = createMediaResourceCache({ create: () => "blob:shared", revoke: url => revoked.push(url) });
  const load = async () => { loads++; return ready.promise; };
  const first = cache.acquire("account:chat:file", "file", load);
  const second = cache.acquire("account:chat:file", "file", load);
  first.release(); ready.resolve(new Blob(["hello"]));
  assert.equal(await second.promise, "blob:shared");
  assert.equal(await first.promise, "blob:shared");
  assert.equal(loads, 1); assert.deepEqual(revoked, []);
  second.release(); cache.clear(); assert.deepEqual(revoked, ["blob:shared"]);
});

test("only unused media is evicted under a byte budget", async () => {
  let serial = 0; const revoked: string[] = [];
  const cache = createMediaResourceCache({ create: () => `blob:${++serial}`, revoke: url => revoked.push(url), maxBytes: 4 });
  const a = cache.acquire("a", "a", async () => new Blob(["1234"])); await a.promise;
  const b = cache.acquire("b", "b", async () => new Blob(["5678"])); await b.promise;
  assert.deepEqual(revoked, []);
  a.release(); assert.deepEqual(revoked, ["blob:1"]);
  b.release(); cache.clear(); assert.deepEqual(revoked, ["blob:1", "blob:2"]);
});

test("account clear aborts in-flight media and prevents late URL creation", async () => {
  const ready = deferred<Blob>(); let creates = 0;
  const cache = createMediaResourceCache({ create: () => { creates++; return "blob:late"; }, revoke: () => {} });
  const resource = cache.acquire("account:a", "a", async () => ready.promise);
  await tick();
  const rejected = assert.rejects(resource.promise);
  cache.clear(); ready.resolve(new Blob(["private"])); await rejected;
  assert.equal(creates, 0);
});

test("deleted attachment aborts all readers without affecting another attachment", async () => {
  const ready = deferred<Blob>();
  const cache = createMediaResourceCache({ create: () => "blob:ok", revoke: () => {} });
  const removed = cache.acquire("one", "gone", async () => ready.promise);
  const rejected = assert.rejects(removed.promise);
  const kept = cache.acquire("two", "kept", async () => new Blob(["ok"]));
  cache.forget(["gone"]); ready.resolve(new Blob(["gone"]));
  await rejected; assert.equal(await kept.promise, "blob:ok");
  kept.release(); cache.clear();
});
