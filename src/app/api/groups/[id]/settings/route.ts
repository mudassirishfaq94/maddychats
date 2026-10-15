import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getGroupWithActor } from "@/server/chat";
import { z } from "zod";
import { publishToConversation } from "@/server/realtime";
import { rateLimit } from "@/server/rate-limit";
import { auditLog } from "@/server/admin";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  rules: z.string().trim().max(2000).nullable().optional(),
  announcements: z.string().trim().max(2000).nullable().optional(),
  adminOnlyMessaging: z.boolean().optional(),
  slowModeSeconds: z.number().int().min(0).max(3600).optional(),
}).strict().refine(value => Object.keys(value).length > 0);

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

  const context = await getGroupWithActor(id, user.id);
  if (!context) return jsonError(404, "Group not found.");
  if (context.membership.role !== "owner" && context.membership.role !== "admin") return jsonError(403, "Only admins can change group settings.");
  const limit = await rateLimit(`group-settings:${user.id}`, 60, 60000);
  if (!limit.allowed) return jsonError(429, "Please wait before changing group settings again.");

  const body = await readJson(req);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Use a group name of 1–200 characters, a description up to 5000 characters, and valid group settings.");
  const patch = parsed.data;

  const [saved] = await db.update(conversations).set({ ...patch, updatedAt: new Date() }).where(eq(conversations.id, id)).returning({ updatedAt: conversations.updatedAt });

  // Audit log
  await auditLog({
    adminId: user.id,
    action: "group_settings_updated",
    details: { groupId: id, fields: Object.keys(patch) },
  });
  await publishToConversation(id, { type: "group:updated", conversationId: id });
  return NextResponse.json({ success: true, settings: { ...patch, updatedAt: saved.updatedAt.toISOString() } });
}
