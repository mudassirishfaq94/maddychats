# Online database migration 0041

Migration 0041 adds exactly one non-unique partial index:

```sql
CREATE INDEX CONCURRENTLY messages_undelivered_conversation_idx
ON public.messages (conversation_id, sender_id)
WHERE delivered_at IS NULL;
```

It supports the SELECT in `src/server/chat.ts:markDeliveredFor`, called when a realtime connection marks incoming messages delivered. The conversation-members join restricts conversations to the authenticated user; sender filtering and all authorization remain unchanged. Completed deliveries are removed from this partial index automatically. No message contents are included.

The up and down SQL files are in `drizzle/online/`. They deliberately sit outside the transactional Drizzle journal: PostgreSQL forbids concurrent index builds inside transactions. Do not paste the entire file into one transactional migration or send all statements as one database request.

With the existing database connection supplied securely through `DATABASE_URL`, run:

```sh
npm run db:migrate
npm run db:migrate:online
```

Run the online migration once for each database, including fresh installations. Existing production received this migration on 2026-10-11. No web-service restart is required. Normal deploys retain the index.

Rollback:

```sh
node scripts/migrate-online-index.mjs down
```

The dedicated runner executes each statement separately in autocommit, serializes competing migration runners with an advisory lock, sets a five-second lock timeout and a thirty-minute statement timeout, checks the exact index definition, and verifies index validity. Apply, repeated apply, rollback, repeated rollback and reapply were tested. An interrupted concurrent build can leave an invalid index: run `down`, then `up`; a same-name index with a different definition is rejected rather than deleted.

Concurrent creation keeps normal inserts, updates and deletes available; it still uses CPU, I/O, and brief metadata locks. Timeouts deliberately fail instead of waiting indefinitely. Existing indexes, unique constraints, encrypted history, query code and app permissions are preserved.

To reproduce the read audit without modifying data:

```sh
node scripts/audit-database-reads.mjs database-read-audit.json
```

Optionally supply `DATABASE_AUDIT_USER_ID` to target a representative account. The audit chooses parameter bindings from the database, executes only fixed read-query shapes within a read-only repeatable-read transaction, uses `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, excludes a warm-up and reports five-sample median execution times. Result rows and bindings are not written to reports; plans redact literal values. Measurements are database execution time, excluding HTTP, network round trips and browser rendering. The source inventory includes additional reads and action preconditions for review; it is not a claim that every application branch was executed.

The screen DTO regression test requires a migrated, disposable **local** Postgres database ending in `_test`:

```sh
# Set DATABASE_INDEX_TEST_URL to the disposable loopback database.
npm run test:database-index
```

It creates owned fixtures, compares 12 application data collections across apply and rollback, and removes those fixtures. It refuses remote databases. It does not rebuild, deploy, change account ownership or disable encryption.

Reference: [PostgreSQL concurrent index creation](https://www.postgresql.org/docs/current/sql-createindex.html).
