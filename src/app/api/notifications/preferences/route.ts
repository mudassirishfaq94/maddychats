import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { notificationPreferencesSchema } from "@/lib/schemas";
import { getNotificationPreferences, updateNotificationPreferences } from "@/server/notification-preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  return NextResponse.json({ preferences: await getNotificationPreferences(me.id) });
}

export async function PATCH(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");
  const parsed = notificationPreferencesSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid preferences.");

  return NextResponse.json({ preferences: await updateNotificationPreferences(me.id, parsed.data) });
}
