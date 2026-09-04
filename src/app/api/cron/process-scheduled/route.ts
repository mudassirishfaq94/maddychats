import { NextRequest, NextResponse } from "next/server";
import { processScheduledMessages } from "@/server/scheduled-messages";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/process-scheduled
 *
 * Processes all due scheduled messages. Can be called by:
 * - Vercel Cron (vercel.json cron config)
 * - External cron services (cron-job.org, etc.)
 * - Any HTTP client with the CRON_SECRET
 *
 * For security, requires CRON_SECRET header in production.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret in production
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return jsonError(401, "Unauthorized.");
    }
  }

  try {
    const result = await processScheduledMessages();
    return NextResponse.json({
      success: true,
      processed: result.processed,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron] Failed to process scheduled messages:", err);
    return jsonError(500, "Failed to process scheduled messages.");
  }
}
