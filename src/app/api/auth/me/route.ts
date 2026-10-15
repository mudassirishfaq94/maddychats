import { NextResponse } from "next/server";
import { touchSessionPresence, getSessionAccess, deviceSetupIdentity } from "@/server/session";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getSessionAccess();
  if (!access) return jsonError(401, "Not authenticated.");
  if (access.approvalRequired) return NextResponse.json({ deviceVerificationRequired: true, user: deviceSetupIdentity(access) }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  const user = await touchSessionPresence(access.user);
  // Identity reads must not overwrite a newer login with an older in-flight
  // session cookie. Proxy rotates expired access through the refresh token,
  // preserving session ID, authentication times, MFA and absolute expiry.
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
