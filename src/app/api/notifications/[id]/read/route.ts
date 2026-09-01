import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError } from "@/server/http";
import { isUuid } from "@/server/users";
import { markNotificationRead } from "@/server/notifications";

export const dynamic = "force-dynamic";

/** Mark a single notification read (owner only). */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Notification not found.");

  const updated = await markNotificationRead(id, me.id);
  if (!updated) return jsonError(404, "Notification not found.");

  return NextResponse.json({ notification: updated });
}
