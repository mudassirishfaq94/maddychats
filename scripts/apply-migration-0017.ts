import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env" });

/** Split SQL on semicolons, honoring the migration's simple statement-per-;-shape. */
function splitStatements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const sql = readFileSync("./drizzle/0017_e2ee_key_rotation.sql", "utf8");
  const statements = splitStatements(sql);
  console.log(`Executing ${statements.length} statements (idempotent mode)...`);

  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await client.query(stmt);
      applied++;
      console.log(`OK: ${stmt.slice(0, 70).replace(/\s+/g, " ")}...`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // "already exists" / "duplicate" means a prior run got it — that's fine.
      if (/already exists|duplicate/i.test(msg)) {
        skipped++;
        console.log(`SKIP (exists): ${stmt.slice(0, 60).replace(/\s+/g, " ")}...`);
      } else {
        console.error(`FAIL: ${stmt.slice(0, 70).replace(/\s+/g, " ")}...`);
        console.error(`  -> ${msg}`);
      }
    }
  }
  console.log(`Done: ${applied} applied, ${skipped} skipped, ${statements.length - applied - skipped} failed`);
  await client.end();
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
