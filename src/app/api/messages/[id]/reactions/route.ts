import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, reactionSchema } from "@/lib/schemas";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { publishToUsers } from "@/server/realtime";
import {
  addReaction,
  conversationIdOfMessage,
  getMembership,
  getMessageDTO,
  memberIdsOf,
  removeReaction,
} from "@/server/chat";

export const dynamic = "force-dynamic";

/** Resolves the message's conversation and asserts viewer membership. */
async function guard(messageId: string, userId: string) {
  if (!isUuid(messageId)) return null;
  const conversationId = await conversationIdOfMessage(messageId);
  if (!conversationId) return null;
  const membership = await getMembership(conversationId, userId);
  if (!membership) return null;
  return conversationId;
}

/** Add a reaction. Duplicates (same user + message + emoji) are no-ops. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `reaction:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit * 4,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) return jsonError(429, "Slow down a little.");

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  const conversationId = await guard(id, me.id);
  if (!conversationId) return jsonError(404, "Message not found.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please pick a valid reaction.",
      fieldErrors(parsed.error),
    );
  }

  await addReaction(id, me.id, parsed.data.emoji);

  // Each recipient needs their own `mine` flag, so publish per-viewer DTOs.
  await publishReactionUpdate(conversationId, id);
  const dto = await getMessageDTO(id, me.id);
  return NextResponse.json({ message: dto });
}

/** Remove one of your own reactions. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  const conversationId = await guard(id, me.id);
  if (!conversationId) return jsonError(404, "Message not found.");

  const emoji = req.nextUrl.searchParams.get("emoji");
  const parsed = reactionSchema.safeParse({ emoji });
  if (!parsed.success) return jsonError(422, "Please pick a valid reaction.");

  await removeReaction(id, me.id, parsed.data.emoji);

  await publishReactionUpdate(conversationId, id);
  const dto = await getMessageDTO(id, me.id);
  return NextResponse.json({ message: dto });
}

/**
 * Publishes a `message:update` carrying the message re-hydrated from the
 * perspective of each member (so everyone's `mine` flag is correct).
 */
async function publishReactionUpdate(conversationId: string, messageId: string) {
  const members = await memberIdsOf(conversationId);
  await Promise.all(
    members.map(async (userId) => {
      const dto = await getMessageDTO(messageId, userId);
      if (!dto) return;
      publishToUsers([userId], {
        type: "message:update",
        conversationId,
        message: dto,
      });
    }),
  );
}
