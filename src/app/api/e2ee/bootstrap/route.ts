import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { e2eeConversationKeys, e2eeKeys } from "@/db/schema";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Share = {
  targetUserId?: unknown;
  targetDeviceId?: unknown;
  encryptedKey?: unknown;
  keyFingerprint?: unknown;
};

/**
 * Establishes the first key for a conversation exactly once. The server never
 * sees the plaintext key: it only stores per-device ciphertext supplied by
 * the initiating client. A transaction lock makes concurrent first sends
 * adopt one key rather than creating incompatible conversations.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req) as Record<string, unknown> | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
  const shares = Array.isArray(body?.shares) ? body.shares as Share[] : [];
  if (!conversationId || !deviceId || shares.length === 0 || shares.length > 100) {
    return jsonError(422, "conversationId, deviceId, and 1–100 key shares are required.");
  }
  if (!await getMembership(conversationId, user.id)) return jsonError(404, "Conversation not found.");

  const parsed = shares.map((share) => ({
    targetUserId: typeof share.targetUserId === "string" ? share.targetUserId : "",
    targetDeviceId: typeof share.targetDeviceId === "string" ? share.targetDeviceId : "",
    encryptedKey: typeof share.encryptedKey === "string" ? share.encryptedKey : "",
    keyFingerprint: typeof share.keyFingerprint === "string" ? share.keyFingerprint : "",
  }));
  const fingerprint = parsed[0]?.keyFingerprint;
  if (!fingerprint || fingerprint.length > 128 || parsed.some((share) =>
    !share.targetUserId || !share.targetDeviceId || !share.encryptedKey || share.keyFingerprint !== fingerprint,
  )) {
    return jsonError(422, "Invalid key shares.");
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`e2ee-bootstrap:${conversationId}`}, 0))`);
    const [existing] = await tx.select({ id: e2eeConversationKeys.id })
      .from(e2eeConversationKeys)
      .where(eq(e2eeConversationKeys.conversationId, conversationId))
      .limit(1);
    if (existing) return false;

    const [sender] = await tx.select({ id: e2eeKeys.id }).from(e2eeKeys)
      .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId), isNotNull(e2eeKeys.trustedAt)))
      .limit(1);
    if (!sender) throw new Error("Unknown sender encryption device.");

    for (const share of parsed) {
      if (!await getMembership(conversationId, share.targetUserId)) {
        throw new Error("A key recipient is not a conversation member.");
      }
      const [recipient] = await tx.select({ id: e2eeKeys.id }).from(e2eeKeys)
        .where(and(eq(e2eeKeys.userId, share.targetUserId), eq(e2eeKeys.deviceId, share.targetDeviceId), isNotNull(e2eeKeys.trustedAt)))
        .limit(1);
      if (!recipient) throw new Error("A key recipient device is not registered.");
    }

    await tx.insert(e2eeConversationKeys).values(parsed.map((share) => ({
      conversationId,
      userId: share.targetUserId,
      deviceId,
      recipientDeviceId: share.targetDeviceId,
      encryptedKey: share.encryptedKey,
      keyFingerprint: fingerprint,
      keyVersion: 1,
      isActive: true,
    })));
    return true;
  }).catch((error) => {
    if (error instanceof Error && /Unknown sender|recipient/.test(error.message)) throw error;
    throw error;
  });

  return NextResponse.json({ created: result });
}
