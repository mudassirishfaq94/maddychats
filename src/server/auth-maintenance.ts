import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Expiry is enforced on reads; retention work must not delay sign-in. */
export async function cleanupExpiredAuthentication() {
  const challenges = await db.execute(sql`
    WITH expired AS (
      SELECT token_hash FROM mfa_challenges WHERE expires_at < now()
      ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
    )
    DELETE FROM mfa_challenges m USING expired e WHERE m.token_hash=e.token_hash
    RETURNING m.token_hash
  `);
  const sessions = await db.execute(sql`
    WITH expired AS (
      SELECT id FROM device_sessions WHERE expires_at < now()
      ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
    )
    DELETE FROM device_sessions d USING expired e WHERE d.id=e.id
    RETURNING d.id
  `);
  return { challenges: challenges.rowCount ?? 0, sessions: sessions.rowCount ?? 0 };
}
