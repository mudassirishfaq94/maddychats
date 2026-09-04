/**
 * Applies a raw SQL migration file to the database.
 * Usage: node -r dotenv/config scripts/apply-migration.ts drizzle/0016_e2ee_messages.sql
 * Requires DATABASE_URL (loaded from .env.local via --env-file on Node 20+).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.ts <sql-file>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const sql = readFileSync(file, "utf8");

(async () => {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`Applied ${file}`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});