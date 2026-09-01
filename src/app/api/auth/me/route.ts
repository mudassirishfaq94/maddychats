import { NextResponse } from "next/server";
import { getSessionUserWithPresence } from "@/server/session";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUserWithPresence();
  if (!user) {
    return jsonError(401, "Not authenticated.");
  }
  return NextResponse.json({ user });
}
