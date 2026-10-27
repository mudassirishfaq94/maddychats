import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";
import type { AdminOperations } from "@/lib/admin-operations";

export const dynamic = "force-dynamic";

/** Counts and process measurements only; never return records, content or credentials. */
export async function GET(request: NextRequest) {
  const blocked = guardSameOrigin(request);
  if (blocked) return blocked;
  try {
    await requireAdmin();
  } catch (cause) {
    return cause instanceof Error && cause.message === "UNAUTHENTICATED"
      ? jsonError(401, "Sign in again to open admin tools.")
      : jsonError(403, "Administrator access and an extra sign-in check are required.");
  }
  try {
    const started = performance.now();
    const result = await db.execute<{
      pending_reports: number; failed_sign_ins: number; scheduled_waiting: number; scheduled_due: number;
    }>(sql`select
      (select count(*)::int from reports where status='pending') as pending_reports,
      (select count(*)::int from login_history where success=false and created_at >= now()-interval '24 hours') as failed_sign_ins,
      (select count(*)::int from scheduled_messages where sent=false) as scheduled_waiting,
      (select count(*)::int from scheduled_messages where sent=false and scheduled_for <= now()) as scheduled_due`);
    const row = result.rows[0];
    const memory = process.memoryUsage();
    const data: AdminOperations = {
      observedAt: new Date().toISOString(),
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      database: { status: "reachable", checkMs: Math.round((performance.now() - started) * 10) / 10 },
      application: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(memory.rss / 1024 / 1024 * 10) / 10,
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024 * 10) / 10,
      },
      attention: {
        pendingReports: Number(row.pending_reports), failedSignIns24h: Number(row.failed_sign_ins),
        scheduledWaiting: Number(row.scheduled_waiting), scheduledDue: Number(row.scheduled_due),
      },
    };
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return jsonError(503, "We couldn't collect the current server checks. Try again.");
  }
}
