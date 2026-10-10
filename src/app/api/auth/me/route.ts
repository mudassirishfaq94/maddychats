import { NextResponse } from "next/server";
import { getSessionUserWithPresence } from "@/server/session";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUserWithPresence();
  if (!user) return jsonError(401, "Not authenticated.");
  // Identity reads must not overwrite a newer login with an older in-flight
  // session cookie. Proxy rotates expired access through the refresh token,
  // preserving session ID, authentication times, MFA and absolute expiry.
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
