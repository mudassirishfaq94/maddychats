import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { e2eeConversationKeys } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Execute key rotation for a conversation.
 * This is called after the client has generated and shared a new key.
 * It marks the old key as inactive and stores it in history.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;
  const conversationId = data.conversationId ? String(data.conversationId) : null;

  if (!conversationId) return jsonError(422, "conversationId is required.");

  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  // Get the current active key
  const [activeKey] = await db
    .select()
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
        eq(e2eeConversationKeys.isActive, true),
      )
    )
    .orderBy(desc(e2eeConversationKeys.rotatedAt))
    .limit(1);

  if (!activeKey) {
    return jsonError(404, "No active key found to rotate.");
  }

  // Sharing replaces the active key and archives its predecessor atomically.
  // Do not deactivate the newly shared key or delete history here: existing
  // messages and media still need those older keys after an app restart.

  return NextResponse.json({ success: true, previousKeyVersion: activeKey.keyVersion });
}
