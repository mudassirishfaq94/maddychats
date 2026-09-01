import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, messages, conversationMembers } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import bcrypt from "bcryptjs";

async function checkAdmin() {
  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return "UNAUTHENTICATED";
    return "FORBIDDEN";
  }
  return null;
}

/** GET /api/admin/users/[id] — Get user details with stats */
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

/** PATCH /api/admin/users/[id] — Update user */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const authError = await checkAdmin();
  if (authError === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
  if (authError === "FORBIDDEN") return jsonError(403, "Admin access required.");

  const { id } = await params;
  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const updateData: Record<string, unknown> = {};

  if (body.displayName !== undefined) updateData.displayName = body.displayName;
  if (body.username !== undefined) updateData.username = body.username;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.bio !== undefined) updateData.bio = body.bio;
  if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
  if (typeof body.password === "string" && body.password.length >= 6) {
    updateData.passwordHash = await bcrypt.hash(body.password, 12);
  }

  // Ban/unban
  if (body.ban === true) {
    updateData.tokenInvalidBeforeAt = new Date();
  } else if (body.ban === false) {
    updateData.tokenInvalidBeforeAt = null;
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError(400, "No valid fields to update.");
  }

  try {
    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
      });

    if (!updated) return jsonError(404, "User not found.");
    return NextResponse.json({ ok: true, user: updated });
  } catch (e) {
    if ((e as Error).message.includes("unique")) {
      return jsonError(409, "Username or email already exists.");
    }
    throw e;
  }
}

/** DELETE /api/admin/users/[id] — Delete user */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const authError = await checkAdmin();
  if (authError === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
  if (authError === "FORBIDDEN") return jsonError(403, "Admin access required.");

  const { id } = await params;

  // Prevent deleting yourself
  const me = await requireAdmin();
  if (me.id === id) return jsonError(400, "Cannot delete your own account.");

  const [deleted] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id });

  if (!deleted) return jsonError(404, "User not found.");
  return NextResponse.json({ ok: true });
}
