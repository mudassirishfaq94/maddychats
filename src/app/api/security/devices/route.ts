import { NextResponse } from "next/server";
import { deviceInventory } from "@/server/device-inventory";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const current = await getSessionDeviceId();
  const { devices, unboundSessions } = await deviceInventory(user.id, current ?? null);
  return NextResponse.json(
    { devices, unboundSessions, currentSessionId: current ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
