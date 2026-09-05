import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { e2eeConversationKeys, e2eeKeyHistory } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { MAX_KEY_HISTORY } from "@/lib/crypto";

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

  // Move old key to history
  try {
    await db.insert(e2eeKeyHistory).values({
      conversationId,
      userId: user.id,
      deviceId: activeKey.deviceId,
      encryptedKey: activeKey.encryptedKey,
      keyVersion: activeKey.keyVersion,
    });
  } catch (e) {
    // Might already exist in history, that's okay
    console.error("Failed to store key history:", e);
  }

  // Mark old key as inactive
  await db
    .update(e2eeConversationKeys)
    .set({ isActive: false })
    .where(eq(e2eeConversationKeys.id, activeKey.id));

  // Clean up old history entries (keep only MAX_KEY_HISTORY per user per conversation)
  const oldHistory = await db
    .select({ id: e2eeKeyHistory.id })
    .from(e2eeKeyHistory)
    .where(
      and(
        eq(e2eeKeyHistory.conversationId, conversationId),
        eq(e2eeKeyHistory.userId, user.id),
      )
    )
    .orderBy(desc(e2eeKeyHistory.keyVersion));

  if (oldHistory.length > MAX_KEY_HISTORY) {
    const idsToDelete = oldHistory.slice(MAX_KEY_HISTORY).map((h) => h.id);
    for (const id of idsToDelete) {
      await db.delete(e2eeKeyHistory).where(eq(e2eeKeyHistory.id, id));
    }
  }

  return NextResponse.json({ success: true, previousKeyVersion: activeKey.keyVersion });
}
