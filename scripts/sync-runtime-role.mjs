import fs from "node:fs";
import pg from "pg";

// Synchronize grants/policies for tables introduced by migrations. Never
// enroll a password here, and never grant a public or per-user API role.
if (!process.env.MIGRATION_DATABASE_URL || new URL(process.env.DATABASE_URL).username !== "circlo_runtime") {
  throw new Error("Runtime grant synchronization requires separated owner/runtime configuration.");
}
const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 1, connectionTimeoutMillis: 15000 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(fs.readFileSync("docs/database/runtime-role.sql", "utf8"));
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  // Never print credentials, SQL parameters or a raw provider error.
  throw new Error("Runtime database grant synchronization failed.", { cause: error instanceof Error ? error.name : "unknown" });
} finally { client.release(); await pool.end(); }
