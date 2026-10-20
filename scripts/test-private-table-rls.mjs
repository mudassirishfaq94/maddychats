import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Requires an explicitly supplied disposable LOCAL cluster. Never connects remotely.
const url = new URL(process.env.RLS_TEST_DATABASE_URL || 'postgresql://invalid/');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Set RLS_TEST_DATABASE_URL to a local test cluster');
const database = `circlo_rls_probe_${Date.now()}`;
const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
let client;
let created = false;
try {
  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='circlo_runtime') THEN
    CREATE ROLE circlo_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF; END $$`);
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const testUrl = new URL(url); testUrl.pathname = `/${database}`;
  client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  const sql = fs.readFileSync('drizzle/0050_restore_private_table_rls.sql', 'utf8');
  const tables = [...sql.split('] LOOP')[0].matchAll(/'([a-z0-9_]+)'/g)].map(match => match[1]);
  for (const table of tables) await client.query(`CREATE TABLE public."${table}" (id integer PRIMARY KEY); INSERT INTO public."${table}" VALUES (1)`);
  await client.query('GRANT USAGE ON SCHEMA public TO circlo_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO circlo_runtime; GRANT SELECT ON communities TO PUBLIC');
  await client.query('BEGIN'); await client.query(sql); await client.query('ROLLBACK');
  assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid='communities'::regclass")).rows[0].relrowsecurity, false);
  await client.query('BEGIN'); await client.query(sql); await client.query('COMMIT');
  assert.equal((await client.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity")).rows[0].n, 0);
  assert.equal((await client.query("SELECT count(*)::int n FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='communities'::regclass AND a.grantee=0")).rows[0].n, 0);
  await client.query('SET ROLE circlo_runtime');
  for (const table of tables) assert.equal((await client.query(`SELECT count(*)::int n FROM public."${table}"`)).rows[0].n, 1, `runtime visibility: ${table}`);
  await client.query('INSERT INTO admin_audit_log VALUES (2)');
  for (const statement of ['UPDATE admin_audit_log SET id=3 WHERE false', 'DELETE FROM admin_audit_log WHERE false', 'TRUNCATE admin_audit_log']) {
    let denied = false;
    try { await client.query(statement); } catch (error) { denied = error.code === '42501'; }
    assert(denied, 'audit mutations must remain forbidden');
  }
  await client.query('RESET ROLE');
  await client.query('BEGIN'); await client.query(sql); await client.query('COMMIT');
  console.log(JSON.stringify({ forwardRepair: 'PASS', tables: tables.length, runtimeVisibility: 'PASS', auditAppendOnly: 'PASS', publicGrantRevocation: 'PASS', rollback: 'PASS', repeatExecution: 'PASS', productionContacted: false }));
} finally {
  if (client) await client.end();
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
