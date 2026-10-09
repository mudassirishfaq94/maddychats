import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys } from "@/db/schema";
import { isUuid } from "@/server/users";
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
  if (!isUuid(conversationId)) return jsonError(422, "Invalid conversationId.");
  let cursor: { version: number; id: string } | null = null;
  const encoded = req.nextUrl.searchParams.get("cursor");
  if (encoded) {
    try {
      if (encoded.length > 200) throw new Error("cursor");
      cursor = JSON.parse(Buffer.from(encoded, "base64url").toString());
      if (!cursor || !Number.isSafeInteger(cursor.version) || cursor.version < 1 || !isUuid(cursor.id)) throw new Error("cursor");
    } catch { return jsonError(422, "Invalid history cursor."); }
  }

  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const [currentDevice] = await db.select({ id: e2eeKeys.id }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, recipientDeviceId))).limit(1);
  if (!currentDevice) return jsonError(403, "Unknown encryption device.");

  // Compact repeated RSA wraps of the same fingerprint only for an exact
  // recipient. Unknown legacy recipients/fingerprints keep every copy. Raw
  // pagination remains available if a compact copy cannot be unwrapped.
  const compact = req.nextUrl.searchParams.get("compact") === "1";
  const result = await db.execute<{
    id: string; conversationId: string; userId: string; encryptedKey: string;
    recipientDeviceId: string | null; deviceId: string; keyVersion: number;
    rotatedAt: string; keyFingerprint: string | null;
  }>(sql`
    WITH copies AS (
      SELECT id,conversation_id,user_id,encrypted_key,recipient_device_id,device_id,
        key_version,rotated_at AS stamp,key_fingerprint FROM e2ee_conversation_keys
      WHERE conversation_id=${conversationId} AND user_id=${user.id} AND is_active=false
        AND (recipient_device_id=${recipientDeviceId} OR recipient_device_id IS NULL)
      UNION ALL
      SELECT id,conversation_id,user_id,encrypted_key,recipient_device_id,device_id,
        key_version,created_at AS stamp,key_fingerprint FROM e2ee_key_history
      WHERE conversation_id=${conversationId} AND user_id=${user.id}
        AND (recipient_device_id=${recipientDeviceId} OR recipient_device_id IS NULL)
    ), grouped AS (
      SELECT *,CASE WHEN ${compact} AND recipient_device_id IS NOT NULL
        AND key_fingerprint ~ '^[0-9]{5}( [0-9]{5}){5}$' THEN key_fingerprint ELSE id::text END AS identity FROM copies
    ), retained AS (
      SELECT DISTINCT ON (device_id,recipient_device_id,identity) *
      FROM grouped ORDER BY device_id,recipient_device_id,identity,key_version DESC,id DESC
    )
    SELECT id,conversation_id AS "conversationId",user_id AS "userId",encrypted_key AS "encryptedKey",
      recipient_device_id AS "recipientDeviceId",device_id AS "deviceId",key_version AS "keyVersion",
      stamp AS "rotatedAt",key_fingerprint AS "keyFingerprint" FROM retained
    WHERE (${cursor?.version ?? null}::integer IS NULL OR (key_version,id)<(${cursor?.version ?? null}::integer,${cursor?.id ?? null}::uuid))
    ORDER BY key_version DESC,id DESC LIMIT 201
  `);
  const history = result.rows.slice(0, 200);
  const last = history.at(-1);
  const nextCursor = result.rows.length > 200 && last
    ? Buffer.from(JSON.stringify({ version: last.keyVersion, id: last.id })).toString("base64url") : null;
  return NextResponse.json({ history, nextCursor });
}
