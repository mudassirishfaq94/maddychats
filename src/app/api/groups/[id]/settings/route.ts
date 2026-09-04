import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getMembership } from "@/server/chat";
import { auditLog } from "@/server/admin";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Update group settings (owner/admin only) */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Group not found.");

  const membership = await getMembership(id, user.id);
  if (!membership) return jsonError(404, "Group not found.");
  if (membership.role === "member") return jsonError(403, "Only admins can change group settings.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};

  if ("adminOnlyMessaging" in data) {
    patch.adminOnlyMessaging = Boolean(data.adminOnlyMessaging);
  }
  if ("rules" in data) {
    patch.rules = data.rules ? String(data.rules).slice(0, 2000) : null;
  }
  if ("announcements" in data) {
    patch.announcements = data.announcements ? String(data.announcements).slice(0, 2000) : null;
  }
  if ("slowModeSeconds" in data) {
    const val = Number(data.slowModeSeconds);
    patch.slowModeSeconds = Number.isFinite(val) ? Math.min(Math.max(0, val), 3600) : 0;
  }

  if (Object.keys(patch).length === 0) {
    return jsonError(422, "No valid settings to update.");
  }

  await db.update(conversations).set(patch).where(eq(conversations.id, id));

  // Audit log
  await auditLog({
    adminId: user.id,
    action: "group_settings_updated",
    details: { groupId: id, changes: patch },
  });

  return NextResponse.json({ success: true, settings: patch });
}
