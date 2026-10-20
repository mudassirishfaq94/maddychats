import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { verifyFreshAuthentication } from "@/server/authentication";
import { replaceRecoveryCodes } from "@/server/two-factor";
import { rateLimit } from "@/server/rate-limit";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`2fa-recovery:${user.id}`, 5, 10 * 60 * 1000)).allowed) return jsonError(429, "Too many attempts.");
  if (!(await verifyFreshAuthentication(user.id, await readJson(req)))) return jsonError(403, "Confirm your credentials or sign in again before replacing recovery codes.");
  const codes = await replaceRecoveryCodes(user.id);
  if (!codes) return jsonError(409, "Enable 2FA first.");
  return NextResponse.json({ recoveryCodes: codes }, { headers: { "Cache-Control": "no-store" } });
}
