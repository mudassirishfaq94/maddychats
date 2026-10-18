import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, ne, or, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, messages, users, conversations } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { hydrateMessages } from "@/server/chat";
import { acknowledgeDelivery } from "@/server/delivery";
import { isUuid } from "@/server/users";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
// Return encrypted envelopes, not an inference based on presence or push acceptance.
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const rows = await db.select({ message: messages, sender: users })
    .from(messages).innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, user.id)))
    .innerJoin(users,eq(users.id,messages.senderId)).innerJoin(conversations,eq(conversations.id,messages.conversationId))
    .where(and(isNull(conversations.deletedAt),or(isNull(conversationMembers.clearedAt),gt(messages.createdAt,conversationMembers.clearedAt)),sql`not exists(select 1 from message_deletions d where d.message_id=${messages.id} and d.user_id=${user.id})`,ne(messages.senderId, user.id), isNull(messages.deliveredAt), isNull(messages.deletedAt), or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date()))))
    .orderBy(messages.createdAt, messages.id).limit(100);
  const envelopes=await hydrateMessages(rows,user.id);
  return NextResponse.json({ envelopes }, { headers });
}
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const body = await readJson(req);
  if (!body || !Array.isArray(body.messageIds) || !body.messageIds.length || body.messageIds.length > 100 || !body.messageIds.every(id => typeof id === "string" && isUuid(id))) return jsonError(422, "Invalid acknowledgments.");
  const acknowledged=await acknowledgeDelivery(user.id,body.messageIds);
  return NextResponse.json({ acknowledged }, { headers });
}
