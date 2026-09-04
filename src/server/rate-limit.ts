/**
 * In-memory fixed-window rate limiter.
 *
 * Suitable for a single-instance deployment. For multi-instance scale,
 * swap the Map for Redis (e.g. sliding-window via INCR + EXPIRE) — the call
 * sites only depend on this module's function signature.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Opportunistic pruning to bound memory usage.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    // An attacker can otherwise keep every bucket active and grow the Map
    // without bound. Map iteration is insertion ordered, so evict the oldest.
    while (buckets.size > 10_000) {
      const oldest = buckets.keys().next().value as string | undefined;
      if (!oldest) break;
      buckets.delete(oldest);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Auth endpoints: 25 requests per 10 minutes per client IP. */
export const AUTH_RATE_LIMIT = { limit: 25, windowMs: 10 * 60 * 1000 } as const;
