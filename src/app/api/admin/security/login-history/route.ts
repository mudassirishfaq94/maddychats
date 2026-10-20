import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { loginHistory } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logins = await db
    .select()
    .from(loginHistory)
    .where(sql`${loginHistory.createdAt} > ${oneDayAgo}`)
    .orderBy(sql`${loginHistory.createdAt} DESC`)
    .limit(100);

  return NextResponse.json({ logins });
}
