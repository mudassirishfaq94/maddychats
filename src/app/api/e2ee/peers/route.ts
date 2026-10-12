import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, e2eeKeys, users } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export type E2EEPeer = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  devices: { deviceId: string; publicKey: string }[];
};

/**
 * Returns every conversation member with registered device public keys. The
 * caller's current device is excluded, but their other devices are included:
 * a message sent on a laptop must also be wrapped for the same user's phone.
 */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const currentDeviceId = req.nextUrl.searchParams.get("deviceId");
  if (!conversationId) return jsonError(422, "conversationId is required.");

  const membership = await getMembership(conversationId, user.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const memberRows = await db
    .select({ userId: conversationMembers.userId, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(eq(conversationMembers.conversationId, conversationId));

  const peers = memberRows;
  if (peers.length === 0) return NextResponse.json({ peers: [] });

  const keyRows = await db
    .select({
      userId: e2eeKeys.userId,
      deviceId: e2eeKeys.deviceId,
      publicKey: e2eeKeys.publicKey,
    })
    .from(e2eeKeys)
    .where(and(
      inArray(
        e2eeKeys.userId,
        peers.map((p) => p.userId),
      ),
      isNotNull(e2eeKeys.trustedAt),
    ));

  const byUser = new Map<string, E2EEPeer>();
  for (const p of peers) {
    byUser.set(p.userId, {
      userId: p.userId,
      displayName: p.user.displayName,
      username: p.user.username,
      avatarUrl: p.user.avatarUrl,
      devices: [],
    });
  }
  for (const k of keyRows) {
    const peer = byUser.get(k.userId);
    if (peer && (k.userId !== user.id || k.deviceId !== currentDeviceId)) peer.devices.push({ deviceId: k.deviceId, publicKey: k.publicKey });
  }

  const permission = req.nextUrl.searchParams.get("allowMessageRequest") === "1"
    ? await db.execute<{ allowed: boolean }>(sql`
    select exists(select 1 from conversations c where c.id=${conversationId}
      and c.type='dm' and c.created_by_id=${user.id} and c.deleted_at is null
      and exists(select 1 from conversation_members p where p.conversation_id=c.id and p.user_id<>${user.id} and p.accepted_at is null)
      and not exists(select 1 from messages m where m.conversation_id=c.id)) as allowed`)
    : null;
  return NextResponse.json({ peers: [...byUser.values()], allowInitialRequest: permission?.rows[0]?.allowed === true });
}
