import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
async function main() {
const url = process.env.DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1") throw new Error("Use the isolated CI database only.");
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("CREATE ROLE circlo_boundary_owner; CREATE ROLE anon; CREATE ROLE authenticated;");
  await client.query("GRANT USAGE, CREATE ON SCHEMA public TO circlo_boundary_owner; GRANT USAGE ON SCHEMA public TO anon, authenticated");
  await client.query("GRANT ALL ON TABLE users TO circlo_boundary_owner, anon, authenticated");
  await client.query("ALTER TABLE users OWNER TO circlo_boundary_owner");
  await client.query(await readFile("drizzle/0042_private_application_tables.sql", "utf8"));
  await client.query("INSERT INTO users(username,display_name,email,password_hash) VALUES('boundary_fixture','Boundary fixture','boundary@example.invalid','fixture-only-not-a-login-hash')");
  for (const role of ["anon", "authenticated"]) {
    await client.query("SET LOCAL ROLE " + role);
    for (const statement of ["SELECT id FROM users", "INSERT INTO users(username,display_name,email,password_hash) VALUES('probe','probe','probe@example.invalid','fixture')",
      "UPDATE users SET bio='probe' WHERE false", "DELETE FROM users WHERE false"]) {
      await client.query("SAVEPOINT denied");
      await assert.rejects(client.query(statement), (error: unknown) => (error as { code?: string }).code === "42501");
      await client.query("ROLLBACK TO SAVEPOINT denied");
    }
    await client.query("RESET ROLE");
  }
  // Defense in depth: even an accidental future SELECT grant yields no rows.
  await client.query("GRANT SELECT ON TABLE users TO anon");
  await client.query("SET LOCAL ROLE anon");
  assert.equal((await client.query("SELECT id FROM users")).rowCount, 0);
  await client.query("RESET ROLE");
  await client.query("SET LOCAL ROLE circlo_boundary_owner");
  assert.equal((await client.query("SELECT id FROM users WHERE username='boundary_fixture'")).rowCount, 1);
  await client.query("RESET ROLE");
  await client.query("ROLLBACK");
  console.log("Browser Data API roles denied SELECT/INSERT/UPDATE/DELETE; RLS remains fail-closed after accidental grants; server owner retains access.");
} finally { client.release(); await pool.end(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Data API boundary test failed"); process.exitCode = 1; });
