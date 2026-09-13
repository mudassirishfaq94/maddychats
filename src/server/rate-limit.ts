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
  const result = await db.execute<{ count: number; window_started_at: Date }>(sql`
    INSERT INTO rate_limit_buckets (key, window_started_at, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_buckets.window_started_at <= now() - (${windowMs} * interval '1 millisecond')
        THEN 1 ELSE rate_limit_buckets.count + 1 END,
      window_started_at = CASE WHEN rate_limit_buckets.window_started_at <= now() - (${windowMs} * interval '1 millisecond')
        THEN now() ELSE rate_limit_buckets.window_started_at END
    RETURNING count, window_started_at
  `);
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
