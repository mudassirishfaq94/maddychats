-- Operator-only preflight. READ ONLY: no migration, DDL, data or config changes.
-- Run on the database identified in the CURRENT Render service configuration.
-- Do not infer that a saved local .env points to production. Never export URLs/secrets.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
SELECT now() AS evidence_time, current_setting('transaction_read_only') AS read_only,
       current_setting('server_version') AS server_version;
SELECT e.extname,e.extversion,n.nspname FROM pg_extension e
JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1;
SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
AND nspname <> 'information_schema' ORDER BY 1;
-- Export the following ledger ONLY (not tables or credentials) as JSON to compare locally.
SELECT id,hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('fcm_tokens','device_sessions') ORDER BY table_name,ordinal_position;
SELECT c.relname,co.conname,co.contype,co.convalidated,pg_get_constraintdef(co.oid) AS definition
FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('fcm_tokens','device_sessions') ORDER BY 1,2;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('fcm_tokens','device_sessions') ORDER BY 1,2;
SELECT relname,n_live_tup,n_dead_tup,n_tup_ins,n_tup_upd,n_tup_del,
pg_total_relation_size(relid)::text AS total_bytes FROM pg_stat_user_tables
WHERE relname IN ('fcm_tokens','device_sessions');
SELECT c.relname,l.mode,l.granted,count(*) FROM pg_locks l
JOIN pg_class c ON c.oid=l.relation
WHERE c.relname IN ('fcm_tokens','device_sessions') GROUP BY 1,2,3;
SELECT count(*) AS active_transactions,
max(extract(epoch FROM now()-xact_start)) AS oldest_seconds
FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
AND xact_start IS NOT NULL;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
AND c.relname IN ('fcm_tokens','device_sessions');
SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
AND tablename IN ('fcm_tokens','device_sessions');
ROLLBACK;
-- A timeout/error aborts the transaction: ROLLBACK; stop and report, do not raise limits blindly.
-- Statistics counters are cumulative/approximate. Repeat bounded snapshots in a normal busy
-- period to measure deltas, and review stat visibility permissions before treating zero as idle.
