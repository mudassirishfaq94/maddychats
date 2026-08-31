import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

/**
 * Single shared PrismaClient instance backed by the `pg` driver adapter.
 *
 * This project uses Prisma's queryCompiler (pure-WASM) engine together with the
 * PostgreSQL driver adapter, so there is NO native Prisma query-engine binary
 * involved at runtime — Prisma talks to PostgreSQL through `pg`.
 *
 * In development, `tsx watch` can reload modules, so we cache the client on
 * `globalThis` to avoid exhausting the database connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}
