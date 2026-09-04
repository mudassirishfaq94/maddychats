import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { exportUserData } from "@/server/privacy";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const data = await exportUserData(user.id);
  return NextResponse.json(data);
}
