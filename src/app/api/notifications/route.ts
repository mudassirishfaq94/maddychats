import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError } from "@/server/http";
import {
  listNotifications,
  markAllNotificationsRead,
} from "@/server/notifications";

export const dynamic = "force-dynamic";

/** Notification feed + persisted unread count. */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 30;
  const data = await listNotifications(me.id, limit);
  return NextResponse.json(data);
}

/** Mark every notification read. */
export async function PATCH(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const count = await markAllNotificationsRead(me.id);
  return NextResponse.json({ ok: true, count });
}
