import { authorizeAdminMutation, adminActionError, lockAdminActor } from "@/server/admin-authentication";
import { db } from "@/db";
import { reports as reportsTable, adminAuditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid } from "@/server/users";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin";
import { getReports } from "@/server/privacy";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    const admin = await requireAdmin();
    const url = new URL(req.url);
    const requestedStatus = url.searchParams.get("status");
    const status = requestedStatus && requestedStatus !== "all" ? requestedStatus : undefined;
    const reports = await getReports(status);
    return NextResponse.json(reports);
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED")
      return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }
}

export async function PUT(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  try {
    const body = await readJson(req);
    const admin = await authorizeAdminMutation(req, body);
    if (!body || typeof body.reportId !== "string" || !isUuid(body.reportId) || typeof body.status !== "string" || !["reviewed", "resolved", "dismissed"].includes(body.status) || (body.reviewNote !== undefined && (typeof body.reviewNote !== "string" || body.reviewNote.length > 1000))) return jsonError(422, "Invalid report changes.");
    const reportId = body.reportId;
    const status = body.status as "reviewed" | "resolved" | "dismissed";
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote : null;
    const updated = await db.transaction(async (tx) => {
      await lockAdminActor(tx, admin.id);
      const [report] = await tx.update(reportsTable).set({ status, reviewedById: admin.id, reviewedAt: new Date(), reviewNote }).where(eq(reportsTable.id, reportId)).returning();
      if (!report) throw new Error("NOT_FOUND");
      await tx.insert(adminAuditLog).values({ adminId: admin.id, action: `report_${status}`, targetUserId: report.targetUserId, details: { actorUserId: admin.id, reportId, status } });
      return report;
    });
    return NextResponse.json(updated);
  } catch (error) { return adminActionError(error); }
}
