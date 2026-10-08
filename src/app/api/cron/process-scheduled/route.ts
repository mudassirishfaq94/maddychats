import { NextRequest, NextResponse } from "next/server";
import { processScheduledMessages } from "@/server/scheduled-messages";
import { jsonError } from "@/server/http";
import { cleanupUploads } from "@/server/upload-retention";
import { cleanupRateLimits } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/process-scheduled
 *
 * Processes all due scheduled messages. Can be called by:
 * - The independent Docker scheduled-worker service
 * - External cron services (cron-job.org, etc.)
 * - Any HTTP client with the CRON_SECRET
 *
 * For security, requires CRON_SECRET header in production.
 */
export async function GET(req: NextRequest) {
  // A missing production secret must fail closed.  Treating it as optional
  // would leave this state-changing endpoint publicly callable after a
  // deployment configuration mistake.
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("[cron] CRON_SECRET is not configured in production.");
    return jsonError(503, "Scheduled processing is unavailable.");
  }
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return jsonError(401, "Unauthorized.");
    }
  }

  try {
    const result = await processScheduledMessages();
    const retention = await cleanupUploads();
    const expiredRateLimits = await cleanupRateLimits();
    return NextResponse.json({
      success: true,
      processed: result.processed,
      failed: result.failed + retention.failed,
      retention,
      expiredRateLimits,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron] Failed to process scheduled messages:", err);
    return jsonError(500, "Failed to process scheduled messages.");
  }
}
