import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration. The connection string comes from DATABASE_URL
 * (.env is auto-loaded by drizzle-kit) — credentials are never committed.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required. Copy .env.example to .env and fill it in.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
