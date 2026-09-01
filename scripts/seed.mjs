#!/usr/bin/env node
/**
 * Maddy Chats development seed.
 *
 * Usage:
 *   DEV_SEED_PASSWORD='choose-a-dev-password' node scripts/seed.mjs
 *
 * Safety:
 * - Refuses to run with NODE_ENV=production.
 * - Requires the password through an environment variable (never hardcoded).
 * - Uses bcrypt(12), the same cost as registration.
 * - Idempotently creates/refreshes only the six reserved development users.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed development users in production.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.DEV_SEED_PASSWORD;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (!password || password.length < 8 || password.length > 72) {
  console.error("DEV_SEED_PASSWORD must be between 8 and 72 characters.");
  process.exit(1);
}

const seedUsers = [
  {
    username: "user_a",
    displayName: "User A",
    email: "user.a@maddychats.local",
    bio: "Development test account A",
  },
  {
    username: "user_b",
    displayName: "User B",
    email: "user.b@maddychats.local",
    bio: "Development test account B",
  },
  {
    username: "alex_chen",
    displayName: "Alex Chen",
    email: "alex@maddychats.local",
    bio: "Coffee, code, and good conversations.",
  },
  {
    username: "sara_khan",
    displayName: "Sara Khan",
    email: "sara@maddychats.local",
    bio: "Product designer and weekend photographer.",
  },
  {
    username: "omar_ali",
    displayName: "Omar Ali",
    email: "omar@maddychats.local",
    bio: "Building things for the web.",
  },
  {
    username: "maya_patel",
    displayName: "Maya Patel",
    email: "maya@maddychats.local",
    bio: "Always planning the next trip.",
  },
];

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query("BEGIN");

  for (const user of seedUsers) {
    await pool.query(
      `
        INSERT INTO users (
          username, display_name, email, password_hash, bio,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, now(), now())
        ON CONFLICT (email) DO UPDATE SET
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          password_hash = EXCLUDED.password_hash,
          bio = EXCLUDED.bio,
          updated_at = now(),
          token_invalid_before_at = now()
      `,
      [
        user.username,
        user.displayName,
        user.email,
        passwordHash,
        user.bio,
      ],
    );
  }

  await pool.query("COMMIT");
  console.log("Development users are ready:");
  console.log("  User A: user_a / user.a@maddychats.local");
  console.log("  User B: user_b / user.b@maddychats.local");
  console.log("  Plus: alex_chen, sara_khan, omar_ali, maya_patel");
  console.log("  Password: read from DEV_SEED_PASSWORD (not printed)");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  console.error("Seed failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await pool.end();
}
