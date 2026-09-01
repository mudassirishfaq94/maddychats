import { NextRequest, NextResponse } from "next/server";
import { eq, like, or, desc, asc, sql, and, gte, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { users, messages, conversationMembers, notifications } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import bcrypt from "bcryptjs";

/** GET /api/admin/users — List users with search, filter, pagination */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const sort = url.searchParams.get("sort") === "asc" ? "asc" : "desc";
  const sortBy = url.searchParams.get("sortBy") ?? "createdAt";

  const sortColumn =
    sortBy === "username" ? users.username :
    sortBy === "displayName" ? users.displayName :
    sortBy === "email" ? users.email :
    users.createdAt;

  const offset = (page - 1) * limit;

  // Build where clause
  const searchCondition = search
    ? or(
        like(users.username, `%${search}%`),
        like(users.displayName, `%${search}%`),
        like(users.email, `%${search}%`),
      )
    : undefined;

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(searchCondition);

  // Get users with stats
  const userList = await db
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
    .where(searchCondition)
    .orderBy(sort === "asc" ? asc(sortColumn) : desc(sortColumn))
    .limit(limit)
    .offset(offset);

  // Get message counts for each user
  const userIds = userList.map((u) => u.id);
  const messageCounts = userIds.length
    ? await db
        .select({
          userId: messages.senderId,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(sql`${messages.senderId} IN ${userIds}`)
        .groupBy(messages.senderId)
    : [];

  const messageCountMap = new Map(messageCounts.map((mc) => [mc.userId, mc.count]));

  // Get conversation counts
  const conversationCounts = userIds.length
    ? await db
        .select({
          userId: conversationMembers.userId,
          count: sql<number>`count(*)::int`,
        })
        .from(conversationMembers)
        .where(sql`${conversationMembers.userId} IN ${userIds}`)
        .groupBy(conversationMembers.userId)
    : [];

  const conversationCountMap = new Map(conversationCounts.map((cc) => [cc.userId, cc.count]));

  const usersWithStats = userList.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    isBanned: u.tokenInvalidBeforeAt !== null,
    messageCount: messageCountMap.get(u.id) ?? 0,
    conversationCount: conversationCountMap.get(u.id) ?? 0,
  }));

  return NextResponse.json({
    users: usersWithStats,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
}

/** POST /api/admin/users — Create a new user */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const { username, displayName, email, password } = body;
  if (!username || !displayName || !email || !password) {
    return jsonError(400, "Username, display name, email, and password are required.");
  }

  // Check uniqueness
  const uname = String(username);
  const eaddr = String(email);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, uname), eq(users.email, eaddr)))
    .limit(1);

  if (existing.length > 0) {
    return jsonError(409, "Username or email already exists.");
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const [created] = await db
    .insert(users)
    .values({
      username: String(username),
      displayName: String(displayName),
      email: String(email),
      passwordHash,
    })
    .returning({ id: users.id, username: users.username });

  return NextResponse.json({ ok: true, user: created }, { status: 201 });
}
