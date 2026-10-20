import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/session";
import {
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { isUuid } from "@/server/users";
import {
  getMembership,
  isBlockedBetween,
  memberIdsOf,
} from "@/server/chat";
import { getPrivacySettings } from "@/server/privacy";
import { publishToUsers } from "@/server/realtime";

export const dynamic = "force-dynamic";

const typingSchema = z.object({ typing: z.boolean() });

/**
 * Publishes ephemeral typing state to the other conversation members.
 *
 * Authorization never comes from the body: the sender id is derived from the
 * verified session, membership is checked server-side, and block state is
 * enforced before any event is published. Short-lived events expire even if
 * retained by the transport for reconnect replay; the UI never polls.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blockedOrigin = guardSameOrigin(req);
  if (blockedOrigin) return blockedOrigin;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const rl = await rateLimit(`typing:${me.id}`, 120, 60_000);
  if (!rl.allowed) return jsonError(429, "Too many typing updates.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(id, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = typingSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Invalid typing state.");

  const privacy = await getPrivacySettings(me.id);
  if (parsed.data.typing && privacy?.typingIndicators === false) return NextResponse.json({ ok: true });

  const memberIds = await memberIdsOf(id);
  const recipients = memberIds.filter((userId) => userId !== me.id);
  for (const userId of recipients) {
    if (await isBlockedBetween(me.id, userId)) {
      return jsonError(403, "You cannot send events in this conversation.");
    }
  }

  await publishToUsers(recipients, {
    type: "typing:update",
    conversationId: id,
    userId: me.id,
    typing: parsed.data.typing,
    expiresAt: new Date(Date.now() + 5000).toISOString(),
  });

  return NextResponse.json({ ok: true });
}
