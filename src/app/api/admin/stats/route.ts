import { NextRequest, NextResponse } from "next/server";
import { sql, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { users, messages, conversations, conversationMembers, notifications } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";

/** GET /api/admin/stats — System-wide statistics */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Total counts
  const [{ totalUsers }] = await db
    .select({ totalUsers: sql<number>`count(*)::int` })
    .from(users);

  const [{ totalMessages }] = await db
    .select({ totalMessages: sql<number>`count(*)::int` })
    .from(messages);

  const [{ totalConversations }] = await db
    .select({ totalConversations: sql<number>`count(*)::int` })
    .from(conversations);

  // Active users (last 24h, 7d, 30d)
  const [{ activeLast24h }] = await db
    .select({ activeLast24h: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastSeenAt, oneDayAgo));

  const [{ activeLast7d }] = await db
    .select({ activeLast7d: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastSeenAt, oneWeekAgo));

  const [{ activeLast30d }] = await db
    .select({ activeLast30d: sql<number>`count(*)::int` })
    .from(users)
    .where(gte(users.lastSeenAt, oneMonthAgo));

  // Messages today
  const [{ messagesToday }] = await db
    .select({ messagesToday: sql<number>`count(*)::int` })
    .from(messages)
    .where(gte(messages.createdAt, oneDayAgo));

  // Messages this week
  const [{ messagesThisWeek }] = await db
    .select({ messagesThisWeek: sql<number>`count(*)::int` })
    .from(messages)
    .where(gte(messages.createdAt, oneWeekAgo));

  // Banned users
  const [{ bannedUsers }] = await db
    .select({ bannedUsers: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.tokenInvalidBeforeAt} IS NOT NULL`);

  // Group vs DM conversations
  const [{ groupCount }] = await db
    .select({ groupCount: sql<number>`count(*)::int` })
    .from(conversations)
    .where(eq(conversations.type, "group"));

  const dmCount = totalConversations - groupCount;

  // Top users by message count
  const topUsers = await db
    .select({
      userId: messages.senderId,
      username: users.username,
      displayName: users.displayName,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .groupBy(messages.senderId, users.username, users.displayName)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  // Messages per day (last 7 days)
  const messagesPerDay = await db
    .select({
      date: sql<string>`to_char(${messages.createdAt}::date, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(gte(messages.createdAt, oneWeekAgo))
    .groupBy(sql`${messages.createdAt}::date`)
    .orderBy(sql`${messages.createdAt}::date`);

  // New users per day (last 7 days)
  const newUsersPerDay = await db
    .select({
      date: sql<string>`to_char(${users.createdAt}::date, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(users)
    .where(gte(users.createdAt, oneWeekAgo))
    .groupBy(sql`${users.createdAt}::date`)
    .orderBy(sql`${users.createdAt}::date`);

  return NextResponse.json({
    totals: {
      users: totalUsers,
      messages: totalMessages,
      conversations: totalConversations,
      groups: groupCount,
      directMessages: dmCount,
      bannedUsers,
    },
    activity: {
      activeLast24h,
      activeLast7d,
      activeLast30d,
      messagesToday,
      messagesThisWeek,
    },
    topUsers,
    charts: {
      messagesPerDay,
      newUsersPerDay,
    },
  });
}
