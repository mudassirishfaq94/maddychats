/**
 * Migration runner.
 *
 * Prisma's schema-engine binary cannot be downloaded in this environment, so we
 * apply Prisma-format SQL migrations ourselves using the `pg` driver and record
 * them in Prisma's own `_prisma_migrations` table — exactly the bookkeeping that
 * `prisma migrate deploy` performs. Migrations live in prisma/migrations/* and
 * are authored in standard Prisma migration format, so this stays fully
 * compatible with the Prisma CLI once engine downloads are available.
 *
 * Usage: tsx scripts/migrate.ts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const MIGRATIONS_DIR = path.join(serverRoot, "prisma", "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✖ DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

async function ensureMigrationsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function discoverMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => ({
      name,
      sqlPath: path.join(MIGRATIONS_DIR, name, "migration.sql"),
    }))
    .filter((m) => fs.existsSync(m.sqlPath));
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("✔ Connected to PostgreSQL.");

  await ensureMigrationsTable(client);

  const applied = await client.query<{ migration_name: string }>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`
  );
  const appliedNames = new Set(applied.rows.map((r) => r.migration_name));

  const migrations = discoverMigrations();
  const pending = migrations.filter((m) => !appliedNames.has(m.name));

  if (pending.length === 0) {
    console.log("✔ Database schema is up to date. No pending migrations.");
    await client.end();
    return;
  }

  for (const migration of pending) {
    const sql = fs.readFileSync(migration.sqlPath, "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const id = crypto.randomUUID();
    console.log(`• Applying migration "${migration.name}"…`);

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)`,
        [id, checksum, migration.name]
      );
      await client.query("COMMIT");
      console.log(`  ✔ Applied "${migration.name}".`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ✖ Failed to apply "${migration.name}".`);
      throw err;
    }
  }

  console.log(`✔ Applied ${pending.length} migration(s).`);
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
