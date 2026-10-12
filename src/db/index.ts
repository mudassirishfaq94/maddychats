import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databasePoolMax } from "../lib/database-settings";

// Route modules are evaluated by Next during `next build`, even when the
// route itself is dynamic.  A build must not open a database connection, but
// production runtime still must fail closed if the required configuration is
// absent.
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const databaseUrl = process.env.DATABASE_URL ?? (
  isProductionBuild ? "postgresql://build:build@127.0.0.1:5432/build" : undefined
);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // A long-running VPS can safely hold a small pool. Keep this bounded so
    // Supabase's shared pooler is not exhausted during traffic spikes.
    max: databasePoolMax(process.env.DATABASE_POOL_MAX),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: databaseUrl.includes("supabase.co")
      ? { rejectUnauthorized: true }
      : undefined,
  });

// Next evaluates separately bundled routes and instrumentation in production.
// Share the resource as well as in development; keep the configured cap global.
globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);

// Idle connections can fail during a database restart. Keep the process alive
// so readiness reports the outage and the pool can reconnect after recovery.
if (pool.listenerCount("error") === 0) {
  pool.on("error", () => console.error("[database] Idle connection lost; reconnecting on next request."));
}
