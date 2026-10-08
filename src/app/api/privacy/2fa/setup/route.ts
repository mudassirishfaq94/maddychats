import { verifyFreshAuthentication } from "@/server/authentication";
import { rateLimit } from "@/server/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { generateTOTPSetup } from "@/server/two-factor";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Generate a 2FA TOTP secret and return setup data */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const rl = await rateLimit(`2fa-setup:${user.id}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, "Too many setup attempts.");
  if (!(await verifyFreshAuthentication(user.id, await readJson(req)))) return jsonError(403, "Confirm your password or sign in again before setting up 2FA.");
  const result = await generateTOTPSetup(user.id);

  if ("error" in result) {
    return jsonError(409, String(result.error));
  }

  return NextResponse.json({
    secret: result.secret,
    otpauthUrl: result.otpauthUrl,
  });
}
