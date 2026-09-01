import { NextRequest, NextResponse } from "next/server";
import { sql, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";

/** GET /api/admin/activity — Recent activity logs */
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
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const typeFilter = url.searchParams.get("type") ?? "all";
  const offset = (page - 1) * limit;

  const typeCondition = typeFilter !== "all" ? eq(notifications.type, typeFilter) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(typeCondition);

  const activityList = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      data: notifications.data,
      createdAt: notifications.createdAt,
      userId: notifications.userId,
      userName: users.displayName,
      userUsername: users.username,
    })
    .from(notifications)
    .innerJoin(users, sql`${notifications.userId} = ${users.id}`)
    .where(typeCondition)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  // Map notification types to human-readable descriptions
  function describe(type: string, data: Record<string, unknown> | null): string {
    switch (type) {
      case "message": return "sent a message";
      case "mention": return "was mentioned";
      case "admin_change": return "had their role changed";
      case "blocked": return "was blocked";
      case "unblocked": return "was unblocked";
      case "group_invite": return "was added to a group";
      case "group_leave": return "left a group";
      default: return type.replace(/_/g, " ");
    }
  }

  return NextResponse.json({
    activities: activityList.map((a) => ({
      id: a.id,
      type: a.type,
      description: describe(a.type, a.data as Record<string, unknown> | null),
      userId: a.userId,
      userName: a.userName,
      userUsername: a.userUsername,
      createdAt: a.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
}
