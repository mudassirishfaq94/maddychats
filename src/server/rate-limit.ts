import { sql } from "drizzle-orm";
import { db } from "@/db";

/** PostgreSQL-backed, atomic fixed-window limiter shared by all instances. */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!key || key.length > 512 || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 86400000) {
    return { allowed: false, retryAfterSeconds: 60 };
  }
  let result;
  try {
    result = await db.execute<{ count: number; window_started_at: Date }>(sql`
    INSERT INTO rate_limit_buckets (key, window_started_at, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.window_started_at <= now() - (${windowMs} * interval '1 millisecond')
        THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_started_at = CASE WHEN rate_limit_buckets.window_started_at <= now() - (${windowMs} * interval '1 millisecond')
        THEN now() ELSE rate_limit_buckets.window_started_at END
    RETURNING count, window_started_at
    `);
  } catch {
    // An instance-local fallback would let an outage bypass shared abuse limits.
    console.error("[rate-limit] Shared store unavailable; request denied.");
    return { allowed: false, retryAfterSeconds: 30 };
  }
  const row = result.rows[0];
  if (!row) throw new Error("rate_limit_unavailable");
  if (row.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  const started = new Date(row.window_started_at).getTime();
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((started + windowMs - Date.now()) / 1000)),
  };
}

/** Auth endpoints: 25 requests per 10 minutes per client IP. */
export const AUTH_RATE_LIMIT = { limit: 25, windowMs: 10 * 60 * 1000 } as const;

/** Bound cleanup work and preserve every possible active (at most 24h) window. */
export async function cleanupRateLimits() {
  const result = await db.execute(sql`
    WITH expired AS (
      SELECT key FROM rate_limit_buckets
      WHERE window_started_at < now() - interval '2 days'
      ORDER BY window_started_at LIMIT 1000 FOR UPDATE SKIP LOCKED
    )
    DELETE FROM rate_limit_buckets b USING expired e WHERE b.key=e.key
    RETURNING b.key
  `);
  return result.rows.length;
}
