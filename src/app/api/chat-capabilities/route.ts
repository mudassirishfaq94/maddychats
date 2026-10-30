import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!await getSessionUser()) return jsonError(401, "Not authenticated.");
  const starter = process.env.STARTER_MODE === "1";
  return NextResponse.json({ media: !starter || process.env.CHAT_MEDIA_ENABLED === "1", scheduled: !starter || process.env.SCHEDULED_MESSAGES_ENABLED === "1", signalProvisioning: false }, { headers: { "Cache-Control": "private, no-store" } });
}
