import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

let db: typeof import("../src/db").db;
let pool: typeof import("../src/db").pool;
let consumeProviderProof: typeof import("../src/server/provider-proof").consumeProviderProof;
const dialect = new PgDialect();

before(async () => {
  const previous = process.env.DATABASE_URL;
  // Only construct the database object. Every execution below is stubbed.
  process.env.DATABASE_URL = "postgresql://fixture:fixture@127.0.0.1:1/provider_proof_test";
  try {
    ({ db, pool } = await import("../src/db"));
    ({ consumeProviderProof } = await import("../src/server/provider-proof"));
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

after(async () => { await pool?.end(); });

test("Google proofs store a digest under a single-use ten-minute budget", async t => {
  const queries: unknown[][] = [];
  t.mock.method(db, "execute", async (query: SQL) => {
    queries.push(dialect.sqlToQuery(query).params);
    return { rows: [{ count: 1, window_started_at: new Date() }] };
  });

  assert.equal(await consumeProviderProof("google-native", "abc"), true);
  assert.equal(queries.length, 1);
  const [key, ...windows] = queries[0];
  assert.equal(key, "provider-proof:google-native:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert(windows.length > 0);
  assert(windows.every(value => value === 600_000));
});

test("a replay is denied without consuming another Google credential's budget", async t => {
  // This models store results to test proof identity, not PostgreSQL atomicity.
  const counts = new Map<string, number>();
  t.mock.method(db, "execute", async (query: SQL) => {
    const key = String(dialect.sqlToQuery(query).params[0]);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return { rows: [{ count, window_started_at: new Date() }] };
  });

  assert.equal(await consumeProviderProof("google-native", "credential-a"), true);
  assert.equal(await consumeProviderProof("google-native", "credential-a"), false);
  assert.equal(await consumeProviderProof("google-native", "credential-b"), true);
  assert.equal(await consumeProviderProof("google-native", "credential-a"), false);
});

test("large Google credentials remain bounded digests and cannot alias a changed suffix", async t => {
  const keys: string[] = [];
  t.mock.method(db, "execute", async (query: SQL) => {
    keys.push(String(dialect.sqlToQuery(query).params[0]));
    return { rows: [{ count: 1, window_started_at: new Date() }] };
  });
  const token = "a".repeat(16_383);
  await consumeProviderProof("google-native", token + "b");
  await consumeProviderProof("google-native", token + "c");
  assert.equal(keys.length, 2);
  for (const key of keys) assert.match(key, /^provider-proof:google-native:[a-f0-9]{64}$/);
  assert.notEqual(keys[0], keys[1]);
});

test("Google proof consumption fails closed when the shared store is unavailable", async t => {
  const errors = t.mock.method(console, "error", () => {});
  t.mock.method(db, "execute", async () => { throw new Error("fixture store failure"); });
  assert.equal(await consumeProviderProof("google-native", "sensitive-fixture-token"), false);
  assert(errors.mock.callCount() > 0);
  assert(!JSON.stringify(errors.mock.calls).includes("sensitive-fixture-token"));
});

test("a missing shared-store result cannot accept a Google proof", async t => {
  t.mock.method(db, "execute", async () => ({ rows: [] }));
  await assert.rejects(consumeProviderProof("google-native", "credential"), /rate_limit_unavailable/);
});
