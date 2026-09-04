import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin";
import { getReports, updateReportStatus, auditLog } from "@/server/privacy";
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
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    const admin = await requireAdmin();
    const body = await readJson(req);
    if (!body) return jsonError(400, "Invalid request body.");

    const data = body as Record<string, unknown>;
    const reportId = data.reportId ? String(data.reportId) : undefined;
    const status = data.status ? String(data.status) : undefined;
    const reviewNote = data.reviewNote ? String(data.reviewNote) : undefined;

    if (!reportId || !status) {
      return jsonError(422, "reportId and status are required.");
    }

    const updated = await updateReportStatus(reportId, status, admin.id, reviewNote);
    
    await auditLog({
      adminId: admin.id,
      action: `report_${status}`,
      targetUserId: updated?.targetUserId ?? undefined,
      details: { reportId, reason: updated?.reason, reviewNote },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED")
      return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }
}
