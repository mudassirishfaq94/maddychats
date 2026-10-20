import { NextRequest, NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { messageAttachments, messages, users } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }

  // Total count and size
  const [{ totalCount, totalSize }] = await db
    .select({
      totalCount: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(${messageAttachments.size}), 0)::bigint`,
    })
    .from(messageAttachments);

  // By type
  const byType = await db
    .select({
      kind: messageAttachments.kind,
      count: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(${messageAttachments.size}), 0)::bigint`,
    })
    .from(messageAttachments)
    .groupBy(messageAttachments.kind);

  // Top uploaders — join through messages to get senderId
  const topUploaders = await db
    .select({
      userId: messages.senderId,
      displayName: users.displayName,
      count: sql<number>`count(*)::int`,
      totalSize: sql<number>`coalesce(sum(${messageAttachments.size}), 0)::bigint`,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .innerJoin(users, eq(messages.senderId, users.id))
    .groupBy(messages.senderId, users.displayName)
    .orderBy(sql`sum(${messageAttachments.size}) DESC`)
    .limit(10);

  return NextResponse.json({
    totalAttachments: totalCount,
    totalSize: Number(totalSize),
    byType: byType.map((t) => ({ kind: t.kind, count: t.count, totalSize: Number(t.totalSize) })),
    topUploaders: topUploaders.map((u) => ({ ...u, totalSize: Number(u.totalSize) })),
  });
}
