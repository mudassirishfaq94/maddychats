import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { e2eeConversationKeys, e2eeKeyHistory, e2eeKeys } from "@/db/schema";
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

  // Rows belong to the recipient (userId) and may be addressed to a device
  // with an id shared by another account in this browser. Do not filter by
  // device id: the private-key unwrap is the authoritative ownership check.
  // This also recovers legacy rows written before deviceId meant recipient.
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

  // Reject self-key storage — you cannot share a key with yourself.
  if (targetUserId === user.id) {
    return jsonError(422, "Cannot share a key with yourself.");
  }

  // Verify target has registered at least one device key.
  const [targetKey] = await db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(eq(e2eeKeys.userId, targetUserId))
    .limit(1);

  if (!targetKey) return jsonError(404, "Target user has no registered device key.");

  const targetMembership = await getMembership(conversationId, targetUserId);
  if (!targetMembership) return jsonError(404, "Target is not in this conversation.");

  // A share must be addressed to one of the target user's registered devices.
  // Besides preventing mislabeled rows, this keeps per-device key rotation
  // and recovery reliable.
  const [targetDevice] = await db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, targetUserId), eq(e2eeKeys.deviceId, deviceId)))
    .limit(1);
  if (!targetDevice) return jsonError(422, "Target device is not registered.");

  // The schema permits one active row per recipient device and recipient user.
  // Serialize replacement and preserve the old share before updating it.
  const newVersion = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${conversationId}:${targetUserId}:${deviceId}`}, 0))`);
    const [existing] = await tx.select().from(e2eeConversationKeys).where(and(
      eq(e2eeConversationKeys.conversationId, conversationId),
      eq(e2eeConversationKeys.userId, targetUserId),
      eq(e2eeConversationKeys.deviceId, deviceId),
    )).limit(1);
    if (existing?.encryptedKey === encryptedKey) return existing.keyVersion;
    const version = (existing?.keyVersion ?? 0) + 1;
    if (existing) {
      await tx.insert(e2eeKeyHistory).values({
        conversationId, userId: targetUserId, deviceId,
        encryptedKey: existing.encryptedKey, keyVersion: existing.keyVersion,
      }).onConflictDoNothing();
      await tx.update(e2eeConversationKeys).set({
        encryptedKey, keyVersion: version, isActive: true, rotatedAt: new Date(),
      }).where(eq(e2eeConversationKeys.id, existing.id));
    } else {
      await tx.insert(e2eeConversationKeys).values({
        conversationId, userId: targetUserId, deviceId,
        encryptedKey, keyVersion: version, isActive: true,
      });
    }
    return version;
  });

  return NextResponse.json({ success: true, keyVersion: newVersion });
}
