import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";
import { isUuid } from "@/server/users";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/** Downloads the caller's visible message history as JSON. Encrypted text is
 * intentionally retained as encrypted payload so server-side export never
 * weakens end-to-end encryption. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await getMembership(id, me.id))) return jsonError(404, "Conversation not found.");
  const rows = await db.select({ id: messages.id, senderId: messages.senderId, text: messages.text, type: messages.type, createdAt: messages.createdAt, encrypted: messages.encrypted })
    .from(messages).where(and(eq(messages.conversationId, id), isNull(messages.deletedAt))).orderBy(asc(messages.createdAt));
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), conversationId: id, messages: rows }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="circlo-chat-${id}.json"`, "Cache-Control": "no-store" },
  });
}
