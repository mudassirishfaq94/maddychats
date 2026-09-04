import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { generateTOTPSetup } from "@/server/two-factor";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/** Generate a 2FA TOTP secret and return setup data */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const result = await generateTOTPSetup(user.id);

  if ("error" in result) {
    return jsonError(409, String(result.error));
  }

  return NextResponse.json({
    secret: result.secret,
    otpauthUrl: result.otpauthUrl,
  });
}
