import { revalidateTag } from "next/cache";
import { PUBLIC_COMMUNITIES_CACHE_TAG } from "@/server/communities";
import { authorizeAdminMutation, adminActionError } from "@/server/admin-authentication";
import { z } from "zod";
import { isUuid } from "@/server/users";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, messages, conversationMembers, adminAuditLog } from "@/db/schema";
import { requireAdmin, lockAdminSubjects } from "@/server/admin";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { hashPassword } from "@/server/password";

async function checkAdmin() {
  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return "UNAUTHENTICATED";
    return "FORBIDDEN";
  }
  return null;
}

/** GET /api/admin/users/[id] â€” Get user details with stats */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const authError = await checkAdmin();
  if (authError === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
  if (authError === "FORBIDDEN") return jsonError(403, "Admin access required.");

  const { id } = await params;
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      tokenInvalidBeforeAt: users.tokenInvalidBeforeAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) return jsonError(404, "User not found.");

  // Get stats
  const [{ messageCount }] = await db
    .select({ messageCount: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.senderId, id));

  const [{ conversationCount }] = await db
    .select({ conversationCount: sql<number>`count(*)::int` })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, id));

  // Get recent messages
  const recentMessages = await db
    .select({
      id: messages.id,
      text: messages.text,
      createdAt: messages.createdAt,
      conversationId: messages.conversationId,
    })
    .from(messages)
    .where(eq(messages.senderId, id))
    .orderBy(sql`${messages.createdAt} DESC`)
    .limit(10);

  return NextResponse.json({
    user: {
      ...user,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      isBanned: user.tokenInvalidBeforeAt !== null,
    },
    stats: {
      messageCount,
      conversationCount,
    },
    recentMessages: recentMessages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

const editSchema = z.object({
  displayName: z.string().trim().min(2).max(50).optional(),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/).optional(),
  email: z.email().max(254).optional(),
  bio: z.string().max(500).optional(),
  newPassword: z.string().min(8).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).optional(),
  ban: z.boolean().optional(),
  // avatar URLs are uploaded through the safety pipeline, not editable here.
});

/** PATCH /api/admin/users/[id] — freshly authenticated administrator only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  try {
    const body = await readJson(req);
    const me = await authorizeAdminMutation(req, body, true);
    const { id } = await params;
    if (!isUuid(id)) return jsonError(422, "Invalid user.");
    const parsed = editSchema.safeParse(body);
    if (!parsed.success || !Object.keys(parsed.data).length) return jsonError(422, "Invalid user changes.");
    const { newPassword, ban, ...changes } = parsed.data;
    const hash = newPassword ? await hashPassword(newPassword) : undefined;
    await db.transaction(async (tx) => {
      const { actor, target } = await lockAdminSubjects(tx, me.id, id);
      if (actor?.role !== "admin") throw new Error("FORBIDDEN");
      if (!target) throw new Error("NOT_FOUND");
      if (target.role === "admin" || id === me.id) throw new Error("FORBIDDEN");
      await tx.update(users).set({ ...changes,
        ...(hash ? { passwordHash: hash } : {}),
        ...(changes.email ? { emailVerifiedAt: null } : {}),
        ...(hash || changes.email || ban === true ? { tokenInvalidBeforeAt: new Date() } : {}),
        ...(ban === true ? { suspendedAt: new Date(), suspendedUntil: null, suspendedBy: me.id, suspensionReason: "Administrative suspension" } : {}),
        ...(ban === false ? { suspendedAt: null, suspendedUntil: null, suspendedBy: null, suspensionReason: null } : {}),
      }).where(eq(users.id, id));
      await tx.insert(adminAuditLog).values({ adminId: me.id, targetUserId: id, action: "user_updated", details: { actorUserId: me.id, subjectUserId: id, fields: Object.keys(parsed.data) } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return adminActionError(error); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  try {
    const me = await authorizeAdminMutation(req, await readJson(req), true);
    const { id } = await params;
    if (!isUuid(id)) return jsonError(422, "Invalid user.");
    await db.transaction(async (tx) => {
      const { actor, target } = await lockAdminSubjects(tx, me.id, id);
      if (actor?.role !== "admin") throw new Error("FORBIDDEN");
      if (!target) throw new Error("NOT_FOUND");
      if (id === me.id || target.role === "admin") throw new Error("FORBIDDEN");
      await tx.insert(adminAuditLog).values({ adminId: me.id, action: "user_deleted", targetUserId: id, details: { actorUserId: me.id, deletedUserId: id } });
      await tx.delete(users).where(eq(users.id, id));
    });
    revalidateTag(PUBLIC_COMMUNITIES_CACHE_TAG, { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) { return adminActionError(error); }
}
