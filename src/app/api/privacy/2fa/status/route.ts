import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { is2FAEnabled } from "@/server/two-factor";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/** Check 2FA status */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const enabled = await is2FAEnabled(user.id);

  return NextResponse.json({ enabled });
}
