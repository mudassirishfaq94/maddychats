import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

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
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
