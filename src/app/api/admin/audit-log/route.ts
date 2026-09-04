import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin";
import { getAuditLog } from "@/server/privacy";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
    const log = await getAuditLog();
    return NextResponse.json(log);
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED")
      return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }
}
