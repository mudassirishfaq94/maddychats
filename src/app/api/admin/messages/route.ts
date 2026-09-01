import { NextRequest, NextResponse } from "next/server";
import { sql, like, desc } from "drizzle-orm";
import { db } from "@/db";
import { messages, users, conversations } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";

/** GET /api/admin/messages — List all messages with search and pagination */
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
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "30", 10)));
  const offset = (page - 1) * limit;

  const searchCondition = search ? like(messages.text, `%${search}%`) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(searchCondition);

  const messageList = await db
    .select({
      id: messages.id,
      text: messages.text,
      createdAt: messages.createdAt,
      senderId: messages.senderId,
      senderName: users.displayName,
      senderUsername: users.username,
      conversationId: messages.conversationId,
      conversationName: sql<string>`COALESCE(${conversations.name}, 'Direct Message')`,
    })
    .from(messages)
    .innerJoin(users, sql`${messages.senderId} = ${users.id}`)
    .innerJoin(conversations, sql`${messages.conversationId} = ${conversations.id}`)
    .where(searchCondition)
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    messages: messageList.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
}
