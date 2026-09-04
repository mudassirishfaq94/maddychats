import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { e2eeConversationKeys, e2eeKeys } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Get conversation encryption keys for this user */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) return jsonError(422, "conversationId is required.");

  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const keys = await db
    .select()
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
      ),
    );

  return NextResponse.json({ keys });
}

/** Share a conversation encryption key with a user */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const conversationId = data.conversationId ? String(data.conversationId) : null;
  const targetUserId = data.targetUserId ? String(data.targetUserId) : null;
  const encryptedKey = data.encryptedKey ? String(data.encryptedKey) : null;
  const deviceId = data.deviceId ? String(data.deviceId) : null;

  if (!conversationId || !targetUserId || !encryptedKey || !deviceId) {
    return jsonError(422, "conversationId, targetUserId, encryptedKey, and deviceId are required.");
  }

  // Verify sender is a member
  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  // Verify target has a registered key
  const [targetKey] = await db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, targetUserId), eq(e2eeKeys.deviceId, deviceId)))
    .limit(1);

  if (!targetKey) return jsonError(404, "Target device key not found.");

  // Upsert the encrypted key
  const [existing] = await db
    .select({ id: e2eeConversationKeys.id })
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, targetUserId),
        eq(e2eeConversationKeys.deviceId, deviceId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(e2eeConversationKeys)
      .set({ encryptedKey })
      .where(eq(e2eeConversationKeys.id, existing.id));
  } else {
    await db.insert(e2eeConversationKeys).values({
      conversationId,
      userId: targetUserId,
      encryptedKey,
      deviceId,
    });
  }

  return NextResponse.json({ success: true });
}
