import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { getPrivacySettings, upsertPrivacySettings } from "@/server/privacy";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const settings = await getPrivacySettings(user.id);
  return NextResponse.json(
    settings || {
      profileVisibility: "everyone",
      lastSeenVisibility: "everyone",
      statusVisibility: "everyone",
      whoCanMessage: "everyone",
      loginAlerts: true,
      readReceipts: true,
      typingIndicators: true,
    }
  );
}

export async function PUT(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const settings = await upsertPrivacySettings(user.id, body);
  return NextResponse.json(settings);
}
