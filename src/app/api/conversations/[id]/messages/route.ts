import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, sendMessageSchema } from "@/lib/schemas";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { publishToConversation } from "@/server/realtime";
import { onlineMembersOf } from "@/server/presence";
import {
  createMessage,
  decodeCursor,
  getMembership,
  getMessageDTO,
  getConversationForUser,
  isBlockedBetween,
  listMessages,
  markMessageDelivered,
  memberIdsOf,
  storeMessageMentions,
  MESSAGE_PAGE_SIZE,
} from "@/server/chat";
import { notifyNewMessage, notifyUser } from "@/server/notifications";

export const dynamic = "force-dynamic";

/**
 * Paginated history — newest page first, `cursor` walks backwards through
 * older messages. Members only, always bounded (default 30, max 50).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(id, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.floor(limitParam)
      : MESSAGE_PAGE_SIZE;
  const cursor = decodeCursor(req.nextUrl.searchParams.get("cursor"));

  const page = await listMessages(id, cursor, limit, me.id);
  return NextResponse.json(page);
}

/** Send a text message (optionally replying to another). Members only. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `msg-send:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit * 4,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "You are sending messages too quickly.");
  }

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(id, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  // Blocking is enforced here on the server — never in the UI alone.
  const members = await memberIdsOf(id);
  const detail = await getConversationForUser(id, me.id);
  if (detail?.type === "dm") {
    for (const other of members.filter((m) => m !== me.id)) {
      if (await isBlockedBetween(me.id, other)) {
        return jsonError(403, "You cannot send messages in this conversation.");
      }
    }
  }

  let message = await createMessage(
    id,
    me.id,
    parsed.data.text,
    parsed.data.replyToMessageId ?? null,
    parsed.data.forwarded,
  );

  // Recipient already connected → the message is delivered on arrival.
  const online = await onlineMembersOf(id, me.id);
  if (online.length > 0) {
    await markMessageDelivered(message.id);
    message = (await getMessageDTO(message.id, me.id)) ?? message;
  }

  await publishToConversation(id, {
    type: "message:new",
    conversationId: id,
    message,
  });
  await notifyNewMessage({
    conversationId: id,
    messageId: message.id,
    actorId: me.id,
    actorName: me.displayName,
    preview: parsed.data.text,
  });
  const mentioned = await storeMessageMentions(message.id, id, parsed.data.text, me.id);
  await Promise.all(mentioned.map((user) => notifyUser(user.id, "mention", {
    conversationId: id,
    messageId: message.id,
    actorName: me.displayName,
    preview: parsed.data.text.slice(0, 140),
  }, me.id)));
  return NextResponse.json({ message }, { status: 201 });
}
