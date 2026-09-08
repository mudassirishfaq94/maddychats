import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { e2eeConversationKeys, e2eeKeyHistory, e2eeKeys } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Get historical encryption keys for a conversation.
 * Used for decrypting messages encrypted with older keys before rotation.
 * Only returns keys for the requesting user's own devices.
 */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const recipientDeviceId = req.nextUrl.searchParams.get("deviceId");
  if (!conversationId) return jsonError(422, "conversationId is required.");
  if (!recipientDeviceId) return jsonError(422, "deviceId is required.");

  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const [currentDevice] = await db.select({ id: e2eeKeys.id }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, recipientDeviceId))).limit(1);
  if (!currentDevice) return jsonError(403, "Unknown encryption device.");

  // Get historical keys shared TO this user (from other users' devices)
  // These are keys stored in e2ee_conversation_keys with isActive=false
  const historicalKeys = await db
    .select({
      id: e2eeConversationKeys.id,
      conversationId: e2eeConversationKeys.conversationId,
      userId: e2eeConversationKeys.userId,
      encryptedKey: e2eeConversationKeys.encryptedKey,
      recipientDeviceId: e2eeConversationKeys.recipientDeviceId,
      deviceId: e2eeConversationKeys.deviceId,
      keyVersion: e2eeConversationKeys.keyVersion,
      rotatedAt: e2eeConversationKeys.rotatedAt,
    })
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
        eq(e2eeConversationKeys.recipientDeviceId, recipientDeviceId),
        eq(e2eeConversationKeys.isActive, false),
      )
    )
    .orderBy(desc(e2eeConversationKeys.keyVersion));

  // Also check the key_history table for older keys
  const historyKeys = await db
    .select({
      id: e2eeKeyHistory.id,
      conversationId: e2eeKeyHistory.conversationId,
      userId: e2eeKeyHistory.userId,
      encryptedKey: e2eeKeyHistory.encryptedKey,
      recipientDeviceId: e2eeKeyHistory.recipientDeviceId,
      deviceId: e2eeKeyHistory.deviceId,
      keyVersion: e2eeKeyHistory.keyVersion,
      rotatedAt: e2eeKeyHistory.createdAt,
    })
    .from(e2eeKeyHistory)
    .where(
      and(
        eq(e2eeKeyHistory.conversationId, conversationId),
        eq(e2eeKeyHistory.userId, user.id),
        eq(e2eeKeyHistory.recipientDeviceId, recipientDeviceId),
      )
    )
    .orderBy(desc(e2eeKeyHistory.keyVersion));

  // Combine and deduplicate
  const allKeys = [...historicalKeys, ...historyKeys];
  const uniqueKeys = new Map<string, typeof allKeys[0]>();
  for (const key of allKeys) {
    const identity = `${key.deviceId}:${key.keyVersion}:${key.encryptedKey}`;
    if (!uniqueKeys.has(identity)) {
      uniqueKeys.set(identity, key);
    }
  }

  return NextResponse.json({
    history: Array.from(uniqueKeys.values()).sort(
      (a, b) => b.keyVersion - a.keyVersion
    ),
  });
}
