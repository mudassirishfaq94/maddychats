import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { verifyAndEnable2FA, disable2FA } from "@/server/two-factor";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Verify TOTP code and enable 2FA, or disable 2FA */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const { code } = body;
  if (!code || typeof code !== "string") {
    return jsonError(422, "Verification code is required.");
  }

  const result = await verifyAndEnable2FA(user.id, code.trim());

  if (!result.success) {
    return jsonError(422, result.error ?? "Verification failed.");
  }

  return NextResponse.json({ success: true, message: "Two-factor authentication enabled." });
}

/** Disable 2FA */
export async function DELETE(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const result = await disable2FA(user.id);

  if (!result.success) {
    return jsonError(422, result.error ?? "Could not disable 2FA.");
  }

  return NextResponse.json({ success: true, message: "Two-factor authentication disabled." });
}
