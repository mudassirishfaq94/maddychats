import { spawn } from "node:child_process";
import { chmod, mkdir, stat, mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";

const [action, file] = process.argv.slice(2);
if (!["backup", "restore"].includes(action) || !file) {
  throw new Error("Usage: node scripts/database-backup.mjs backup|restore FILE");
}
const connectionString = action === "restore" ? process.env.RESTORE_DATABASE_URL : process.env.DATABASE_URL;
if (!connectionString) throw new Error(`${action === "restore" ? "RESTORE_DATABASE_URL" : "DATABASE_URL"} is required`);
const url = new URL(connectionString);
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Expected PostgreSQL URL");
const path = resolve(file);
const manifestFile = `${path}.json`;
let existingSchemas = [];
if (action === "backup") {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  for (const candidate of [path, manifestFile]) {
    try {
      await stat(candidate);
      throw new Error("Refusing to overwrite an existing backup");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  // Schema-scoped pg_dump omits extension definitions. Record the public
  // extension dependencies as well as pg_trgm when installed elsewhere.
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const extensions = (await client.query(`select e.extname as name,n.nspname as schema
      from pg_extension e join pg_namespace n on n.oid=e.extnamespace
      where e.extname <> 'plpgsql' and (n.nspname in ('public','drizzle') or e.extname='pg_trgm')
      order by e.extname`)).rows;
    const requiredRoles = (await client.query(`select distinct r.rolname as name
      from pg_policy p join pg_class c on c.oid=p.polrelid
      join pg_namespace n on n.oid=c.relnamespace
      cross join lateral unnest(p.polroles) role_id
      join pg_roles r on r.oid=role_id
      where n.nspname in ('public','drizzle') order by r.rolname`)).rows.map(row => row.name);
    await writeFile(manifestFile, JSON.stringify({ version: 1, extensions, requiredRoles }, null, 2), { mode: 0o600, flag: "wx" });
  } finally { await client.end(); }
} else {
  await stat(path);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.extensions)) throw new Error("Unsupported backup manifest");
  const identifier = (value) => {
    if (typeof value !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value)) throw new Error("Invalid extension manifest");
    return `"${value}"`;
  };
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const existing = await client.query(`select count(*)::int as count from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','drizzle')
      and c.relkind in ('r','p','v','m','S')`);
    if (existing.rows[0].count) throw new Error("Restore requires an empty destination database; existing data is never overwritten");
    if (manifest.requiredRoles !== undefined) {
      if (!Array.isArray(manifest.requiredRoles) || manifest.requiredRoles.some(role => typeof role !== "string")) throw new Error("Invalid policy role manifest");
      const roles = (await client.query("select rolname from pg_roles where rolname = any($1::text[])", [manifest.requiredRoles])).rows.map(row => row.rolname);
      const missing = manifest.requiredRoles.filter(role => !roles.includes(role));
      if (missing.length) throw new Error("Destination is missing required policy roles. Prepare reviewed non-login roles in the isolated database cluster before restoration; roles are never created automatically.");
    }
    for (const extension of manifest.extensions) {
      const name = identifier(extension.name), schema = identifier(extension.schema);
      const installed = (await client.query(`select n.nspname as schema from pg_extension e
        join pg_namespace n on n.oid=e.extnamespace where e.extname=$1`, [extension.name])).rows[0];
      if (installed && installed.schema !== extension.schema) throw new Error("Existing extension schema differs from the backup; use a matching staging database");
      if (!installed) {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
        await client.query(`CREATE EXTENSION ${name} WITH SCHEMA ${schema}`);
      }
    }
    existingSchemas = (await client.query("select nspname from pg_namespace where nspname in ('public','drizzle')")).rows.map((row) => row.nspname);
  } finally { await client.end(); }
}
// Pass credentials through the child environment, never the process command line.
const childEnv = { ...process.env,
  PGHOST: url.hostname, PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGSSLMODE: url.searchParams.get("sslmode") || process.env.PGSSLMODE || "prefer",
  PGSSLROOTCERT: url.searchParams.get("sslrootcert") || process.env.PGSSLROOTCERT,
  PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || "10",
};
const executable = action === "backup" ? "pg_dump" : "pg_restore";
const args = action === "backup"
  ? ["--no-password", "--lock-wait-timeout=10s", "--format=custom", "--no-owner", "--no-acl", "--schema=public", "--schema=drizzle", "--exclude-table-data=public.temporary_rooms", "--exclude-table-data=public.temporary_room_messages", "--file", path]
  : ["--no-password", "--dbname", childEnv.PGDATABASE, "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", path];
const bin = process.env.PG_BIN ? join(process.env.PG_BIN, executable + (process.platform === "win32" ? ".exe" : "")) : executable;
const execute = (options, capture = false) => new Promise((accept, reject) => {
  const child = spawn(bin, options, { env: childEnv, stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"], windowsHide: true });
  let output = "";
  if (capture) child.stdout.on("data", (chunk) => output += chunk);
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? accept(output) : reject(new Error(`${executable} failed`)));
});
if (action === "restore" && existingSchemas.length) {
  // A newly created PostgreSQL database already has an empty public schema.
  // Skip existing CREATE SCHEMA entries, retaining all their contents, rather
  // than dropping schemas or enabling destructive --clean restoration.
  const listing = await execute(["--list", path], true);
  const temporary = await mkdtemp(join(tmpdir(), "circlo-restore-"));
  const listFile = join(temporary, "restore.list");
  try {
    const filtered = listing.split("\n").filter((line) => {
      const schemaEntry = line.match(/^\d+; \d+ \d+ SCHEMA - (\S+)\s/);
      return !schemaEntry || !existingSchemas.includes(schemaEntry[1]);
    }).join("\n");
    await writeFile(listFile, filtered, { mode: 0o600 });
    await execute(["--use-list", listFile, ...args]);
  } finally {
    await unlink(listFile).catch(() => undefined);
    await rmdir(temporary);
  }
} else {
  await execute(args);
}
if (action === "backup") await chmod(path, 0o600);
console.log(action === "backup" ? "Application database backup completed" : "Application database restored to empty destination");
