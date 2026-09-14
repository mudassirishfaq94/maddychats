import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, e2eeSignalDevices, e2eeSignalPrekeys } from "@/db/schema";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";

export const dynamic = "force-dynamic";

type ConsumedPrekey = { key_id: number; public_key: string };

/**
 * Return a public X3DH bundle for every active device belonging to a
 * conversation member. A one-time prekey is consumed atomically, so concurrent
 * senders cannot establish two sessions using the same prekey.
 */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const targetUserId = req.nextUrl.searchParams.get("userId");
  if (!conversationId || !targetUserId || !isUuid(targetUserId)) return jsonError(422, "conversationId and a valid userId are required.");
  if (!await getMembership(conversationId, user.id)) return jsonError(404, "Conversation not found.");
  const [targetMember] = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(and(
    eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, targetUserId),
  )).limit(1);
  if (!targetMember) return jsonError(404, "Target is not in this conversation.");

  const bundles = await db.transaction(async (tx) => {
    const devices = await tx.select().from(e2eeSignalDevices).where(and(eq(e2eeSignalDevices.userId, targetUserId), isNull(e2eeSignalDevices.revokedAt)));
    return Promise.all(devices.map(async (device) => {
      const [signedPrekey] = await tx.select().from(e2eeSignalPrekeys).where(and(
        eq(e2eeSignalPrekeys.userId, targetUserId), eq(e2eeSignalPrekeys.deviceId, device.deviceId), eq(e2eeSignalPrekeys.kind, "signed"),
      )).limit(1);
      if (!signedPrekey?.signature) return null;
      const consumed = await tx.execute<ConsumedPrekey>(sql`
        WITH candidate AS (
          SELECT id FROM e2ee_signal_prekeys
          WHERE user_id = ${targetUserId} AND device_id = ${device.deviceId}
            AND kind = 'one_time' AND consumed_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        UPDATE e2ee_signal_prekeys SET consumed_at = now()
        WHERE id = (SELECT id FROM candidate)
        RETURNING key_id, public_key
      `);
      const oneTime = consumed.rows[0] ?? null;
      return {
        deviceId: device.deviceId, registrationId: device.registrationId,
        identityKey: device.identityKey, signingKey: device.signingKey,
        signedPrekey: { keyId: signedPrekey.keyId, publicKey: signedPrekey.publicKey, signature: signedPrekey.signature },
        oneTimePrekey: oneTime ? { keyId: oneTime.key_id, publicKey: oneTime.public_key } : null,
      };
    }));
  });
  return NextResponse.json({ bundles: bundles.filter((bundle): bundle is NonNullable<typeof bundle> => bundle !== null) });
}
