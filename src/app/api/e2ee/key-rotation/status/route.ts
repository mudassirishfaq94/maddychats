import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { e2eeConversationKeys, e2eeKeys } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError } from "@/server/http";
import { shouldRotateKey } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Check if a conversation's encryption key needs rotation.
 * Returns { needsRotation, reason, lastRotatedAt, messageCount }
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

  // Get the current active key for this user in this conversation
  const [activeKey] = await db
    .select()
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
        eq(e2eeConversationKeys.recipientDeviceId, recipientDeviceId),
        eq(e2eeConversationKeys.isActive, true),
      )
    )
    .orderBy(desc(e2eeConversationKeys.rotatedAt))
    .limit(1);

  if (!activeKey) {
    return NextResponse.json({
      needsRotation: false,
      reason: null,
      lastRotatedAt: null,
      keyVersion: 0,
    });
  }

  const { shouldRotate, reason } = shouldRotateKey(activeKey.rotatedAt);

  return NextResponse.json({
    needsRotation: shouldRotate,
    reason,
    lastRotatedAt: activeKey.rotatedAt,
    keyVersion: activeKey.keyVersion,
  });
}
