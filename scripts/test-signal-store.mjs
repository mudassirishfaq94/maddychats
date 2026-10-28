import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";

// Real browser IndexedDB + Web Crypto, with synthetic records only.
const { outputFiles } = await build({
  entryPoints: ["src/lib/e2ee-signal-store.ts"], bundle: true, write: false, format: "iife",
  globalName: "SignalStorage", plugins: [{ name: "client-boundary", setup(builder) {
    builder.onResolve({ filter: /^client-only$/ }, () => ({ path: "client-only", namespace: "empty" }));
    builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "" }));
  } }],
});
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/store.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(outputFiles[0].text);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><title>Isolated Signal storage test</title><script src="/store.js"></script>');
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const browser = await chromium.launch();
let deadline;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  const result = await Promise.race([page.evaluate(async () => {
    const { SignalLocalStore } = SignalStorage;
    const encoder = new TextEncoder(), decoder = new TextDecoder();
    const first = await SignalLocalStore.open(), second = await SignalLocalStore.open();
    // Force two initializations to generate candidates before either commits.
    // The old read/generate/put implementation overwrites the master key here.
    const realGenerate = crypto.subtle.generateKey.bind(crypto.subtle);
    let generated = 0, release;
    const bothGenerated = new Promise(resolve => { release = resolve; });
    crypto.subtle.generateKey = async (...args) => {
      const key = await realGenerate(...args);
      if (++generated === 2) release();
      await bothGenerated;
      return key;
    };
    try {
      await Promise.all([
        first.saveBytes("session", "account-a", "device-a", encoder.encode("first synthetic state")),
        second.saveBytes("session", "account-b", "device-b", encoder.encode("second synthetic state")),
      ]);
    } finally { crypto.subtle.generateKey = realGenerate; }
    const preserved = decoder.decode(await first.loadBytes("session", "account-a", "device-a")) === "first synthetic state"
      && decoder.decode(await second.loadBytes("session", "account-b", "device-b")) === "second synthetic state";
    first.close(); second.close();
    const reopened = await SignalLocalStore.open();
    const restart = decoder.decode(await reopened.loadBytes("session", "account-a", "device-a")) === "first synthetic state";
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("maddy-signal-v2", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const read = id => new Promise((resolve, reject) => {
      const request = db.transaction("records", "readonly").objectStore("records").get(id);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const put = record => new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readwrite"); transaction.objectStore("records").put(record);
      transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error);
    });
    const master = await read("master-key");
    const nonextractable = master.value.extractable === false;
    const competitor = await SignalLocalStore.open();
    const address = { namespace: "transition", userId: "account-a", deviceId: "device-a" };
    const racing = await Promise.allSettled([
      reopened.compareAndSwap([{ ...address, expectedVersion: 0, bytes: encoder.encode("first transition") }]),
      competitor.compareAndSwap([{ ...address, expectedVersion: 0, bytes: encoder.encode("second transition") }]),
    ]);
    const concurrentWinner = racing.filter(result => result.status === "fulfilled").length === 1;
    const winner = await reopened.loadSnapshot(address.namespace, address.userId, address.deviceId);
    const winnerPreserved = winner.version === 1 && decoder.decode(winner.bytes) === (racing[0].status === "fulfilled" ? "first transition" : "second transition");
    let staleRejected = false;
    try { await reopened.compareAndSwap([
      { ...address, expectedVersion: 0, bytes: encoder.encode("stale state") },
      { ...address, namespace: "must-not-commit", expectedVersion: 0, bytes: encoder.encode("orphaned outbox") },
    ]); } catch { staleRejected = true; }
    const staleAtomic = staleRejected && await reopened.loadBytes("must-not-commit", address.userId, address.deviceId) === null;
    const actualPut = IDBObjectStore.prototype.put;
    async function quotaFailure(versioned) {
      const prefix = versioned ? "atomic" : "legacy-atomic";
      let puts = 0, rejected = false;
      IDBObjectStore.prototype.put = function (record, ...args) {
        if (record.id.startsWith(prefix + "-") && ++puts === 2) throw new DOMException("Synthetic quota failure", "QuotaExceededError");
        return actualPut.call(this, record, ...args);
      };
      try {
        const records = ["prekeys", "outbox"].map(name => ({ namespace: prefix + "-" + name, userId: address.userId, deviceId: address.deviceId, expectedVersion: 0, bytes: encoder.encode("synthetic transition") }));
        if (versioned) await reopened.compareAndSwap(records); else await reopened.saveMany(records);
      } catch { rejected = true; }
      finally { IDBObjectStore.prototype.put = actualPut; }
      return rejected && await reopened.loadBytes(prefix + "-prekeys", address.userId, address.deviceId) === null
        && await reopened.loadBytes(prefix + "-outbox", address.userId, address.deviceId) === null;
    }
    const quotaAtomic = await quotaFailure(true), legacyQuotaAtomic = await quotaFailure(false);
    const actualTransaction = IDBDatabase.prototype.transaction;
    let strictCommitSupported = false, weakDurabilityRejected = false;
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = actualTransaction.apply(this, args);
      if (args[1] === "readwrite") {
        strictCommitSupported = args[2]?.durability === "strict" && transaction.durability === "strict";
        Object.defineProperty(transaction, "durability", { value: "relaxed" });
      }
      return transaction;
    };
    try { await reopened.compareAndSwap([{ ...address, namespace: "weak-durability", expectedVersion: 0, bytes: encoder.encode("unused") }]); }
    catch { weakDurabilityRejected = true; }
    finally { IDBDatabase.prototype.transaction = actualTransaction; }
    weakDurabilityRejected &&= await reopened.loadBytes("weak-durability", address.userId, address.deviceId) === null;
    let mixedScopeRejected = false;
    try { await reopened.compareAndSwap([
      { ...address, namespace: "mixed-one", expectedVersion: 0, bytes: encoder.encode("unused") },
      { ...address, namespace: "mixed-two", userId: "another-account", expectedVersion: 0, bytes: encoder.encode("unused") },
    ]); } catch { mixedScopeRejected = true; }
    await reopened.compareAndSwap([{ ...address, expectedVersion: 1, bytes: null }]);
    const tombstone = await reopened.loadSnapshot(address.namespace, address.userId, address.deviceId);
    let obsoleteWriterDenied = 0;
    try { await competitor.saveBytes(address.namespace, address.userId, address.deviceId, encoder.encode("obsolete write")); } catch { obsoleteWriterDenied++; }
    try { await competitor.remove(address.namespace, address.userId, address.deviceId); } catch { obsoleteWriterDenied++; }
    const tombstonePreserved = tombstone.version === 2 && tombstone.bytes === null && obsoleteWriterDenied === 2;
    const versioned = await read("transition:account-a:device-a");
    await put({ ...versioned, value: { ...versioned.value, version: 3 } });
    let versionTamperRejected = false;
    try { await reopened.loadSnapshot(address.namespace, address.userId, address.deviceId); } catch { versionTamperRejected = true; }
    competitor.close();
    const original = await read("session:account-a:device-a");
    let swapsRejected = 0;
    for (const [namespace, account, device] of [["other", "account-a", "device-a"], ["session", "account-b", "device-a"], ["session", "account-a", "device-b"]]) {
      await put({ id: `${namespace}:${account}:${device}`, value: original.value });
      try { await reopened.loadBytes(namespace, account, device); } catch { swapsRejected++; }
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const legacy = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, master.value, encoder.encode("older synthetic state"));
    await put({ id: "legacy:account-a:device-a", value: { iv: iv.buffer, ciphertext: legacy } });
    const legacyReadable = decoder.decode(await reopened.loadBytes("legacy", "account-a", "device-a")) === "older synthetic state";
    await reopened.remove("legacy", "account-a", "device-a");
    const removalCommitted = await reopened.loadBytes("legacy", "account-a", "device-a") === null;
    const altered = original.value.ciphertext.slice(0); new Uint8Array(altered)[0] ^= 1;
    await put({ id: original.id, value: { ...original.value, ciphertext: altered } });
    let tamperingRejected = false;
    try { await reopened.loadBytes("session", "account-a", "device-a"); } catch { tamperingRejected = true; }
    await put({ id: "broken:account-a:device-a", value: {} });
    let malformedRecordRejected = false;
    try { await reopened.loadBytes("broken", "account-a", "device-a"); } catch { malformedRecordRejected = true; }
    // Corrupted existing master material must never trigger replacement.
    await put({ id: "master-key", value: "invalid synthetic key" });
    let invalidMasterRejected = false;
    try { await reopened.saveBytes("new", "account-a", "device-a", encoder.encode("unused")); } catch { invalidMasterRejected = true; }
    const invalidMasterPreserved = (await read("master-key")).value === "invalid synthetic key";
    reopened.close(); db.close();
    return { generated, preserved, restart, nonextractable, swapsRejected, legacyReadable, removalCommitted, tamperingRejected, malformedRecordRejected, invalidMasterRejected, invalidMasterPreserved,
      concurrentWinner, winnerPreserved, staleAtomic, quotaAtomic, legacyQuotaAtomic, strictCommitSupported, weakDurabilityRejected, mixedScopeRejected, tombstonePreserved, versionTamperRejected };
  }), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("Signal storage test exceeded 30 seconds")), 30000); })]);
  assert.deepEqual(result, { generated: 2, preserved: true, restart: true, nonextractable: true, swapsRejected: 3,
    legacyReadable: true, removalCommitted: true, tamperingRejected: true, malformedRecordRejected: true, invalidMasterRejected: true, invalidMasterPreserved: true,
    concurrentWinner: true, winnerPreserved: true, staleAtomic: true, quotaAtomic: true, legacyQuotaAtomic: true, strictCommitSupported: true, weakDurabilityRejected: true, mixedScopeRejected: true, tombstonePreserved: true, versionTamperRejected: true });
  console.log("PASS actual browser: concurrent initialization/transitions, atomic quota rollback, account/device binding, tombstones, legacy reads and tamper rejection");
  await context.close();
} finally {
  clearTimeout(deadline);
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
