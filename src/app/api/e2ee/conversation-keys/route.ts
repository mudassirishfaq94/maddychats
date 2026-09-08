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
  const recipientDeviceId = req.nextUrl.searchParams.get("deviceId");
  if (!conversationId) return jsonError(422, "conversationId is required.");
  if (!recipientDeviceId) return jsonError(422, "deviceId is required.");

  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  // Verify the requested device belongs to this user. Key copies must never
  // be returned to another one of the user's devices: each copy was wrapped
  // to exactly one device public key.
  const [currentDevice] = await db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, recipientDeviceId)))
    .limit(1);
  if (!currentDevice) return jsonError(403, "Unknown encryption device.");

  const allKeys = await db
    .select()
    .from(e2eeConversationKeys)
    .where(
      and(
        eq(e2eeConversationKeys.conversationId, conversationId),
        eq(e2eeConversationKeys.userId, user.id),
      ),
    );

  // Rows with a recipientDeviceId are the corrected protocol. Keep legacy
  // rows as a best-effort recovery path; their recipient cannot be known, so
  // the client will only use a row that its private key can actually unwrap.
  const keys = allKeys.filter((k) =>
    k.recipientDeviceId === recipientDeviceId || k.recipientDeviceId === null,
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
  const senderDeviceId = data.deviceId ? String(data.deviceId) : null;
  const recipientDeviceId = data.targetDeviceId ? String(data.targetDeviceId) : null;

  if (!conversationId || !targetUserId || !encryptedKey || !senderDeviceId || !recipientDeviceId) {
    return jsonError(422, "conversationId, targetUserId, targetDeviceId, encryptedKey, and deviceId are required.");
  }

  // Verify sender is a member
  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  // A sender may share to another one of their own devices, but never needs a
  // copy encrypted back to the exact device that is already holding the key.
  if (targetUserId === user.id && recipientDeviceId === senderDeviceId) {
    return jsonError(422, "Cannot share a key with the same device.");
  }

  const [senderDevice] = await db.select({ id: e2eeKeys.id }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, senderDeviceId))).limit(1);
  if (!senderDevice) return jsonError(403, "Unknown sender encryption device.");

  // Verify the exact recipient device exists and belongs to the target user.
  // A client-provided public key alone is not an authorization boundary.
  const [targetKey] = await db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, targetUserId), eq(e2eeKeys.deviceId, recipientDeviceId)))
    .limit(1);

  if (!targetKey) return jsonError(404, "Target user has no registered device key.");

  const targetMembership = await getMembership(conversationId, targetUserId);
  if (!targetMembership) return jsonError(404, "Target is not in this conversation.");

  // There is one key copy per sender-device/recipient-device pair. Serialize
  // replacement and preserve the previous copy before updating it.
  const newVersion = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${conversationId}:${targetUserId}:${senderDeviceId}:${recipientDeviceId}`}, 0))`);
    const [existing] = await tx.select().from(e2eeConversationKeys).where(and(
      eq(e2eeConversationKeys.conversationId, conversationId),
      eq(e2eeConversationKeys.userId, targetUserId),
      eq(e2eeConversationKeys.deviceId, senderDeviceId),
      eq(e2eeConversationKeys.recipientDeviceId, recipientDeviceId),
    )).limit(1);
    if (existing?.encryptedKey === encryptedKey) return existing.keyVersion;
    const version = (existing?.keyVersion ?? 0) + 1;
    if (existing) {
      await tx.insert(e2eeKeyHistory).values({
        conversationId, userId: targetUserId, deviceId: senderDeviceId, recipientDeviceId,
        encryptedKey: existing.encryptedKey, keyVersion: existing.keyVersion,
      }).onConflictDoNothing();
      await tx.update(e2eeConversationKeys).set({
        encryptedKey, keyVersion: version, isActive: true, rotatedAt: new Date(),
      }).where(eq(e2eeConversationKeys.id, existing.id));
    } else {
      await tx.insert(e2eeConversationKeys).values({
        conversationId, userId: targetUserId, deviceId: senderDeviceId, recipientDeviceId,
        encryptedKey, keyVersion: version, isActive: true,
      });
    }
    return version;
  });

  return NextResponse.json({ success: true, keyVersion: newVersion });
}
