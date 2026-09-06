import { after, NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
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
import { publishToUsers } from "@/server/realtime";
import { onlineMembersOf } from "@/server/presence";
import {
  createMessage,
  decodeCursor,
  getMembership,
  isBlockedBetween,
  listMessages,
  markMessageDelivered,
  memberIdsOf,
  storeMessageMentions,
  MESSAGE_PAGE_SIZE,
} from "@/server/chat";
import { notifyNewMessage, notifyUser } from "@/server/notifications";
import { isSpammingMessages, isDuplicateMessage } from "@/server/spam-detection";

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

  // Lazy-process any due scheduled messages for this conversation
  // This ensures messages appear even if the cron hasn't run yet
  try {
    const { processScheduledMessages } = await import("@/server/scheduled-messages");
    void processScheduledMessages(); // fire-and-forget, don't block the response
  } catch {
    // best-effort
  }

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

  const isEncrypted = parsed.data.encrypted === true;
  // Independent reads run together; sending does not need member profiles,
  // backgrounds, or the other detail fields loaded by the chat page.
  const [spamCheck, isDupe, [detail], members] = await Promise.all([
    isSpammingMessages(me.id),
    !isEncrypted && parsed.data.text
      ? isDuplicateMessage(me.id, parsed.data.text, id)
      : Promise.resolve(false),
    db.select({
      type: conversations.type,
      adminOnlyMessaging: conversations.adminOnlyMessaging,
      slowModeSeconds: conversations.slowModeSeconds,
      lastMessageAt: conversations.lastMessageAt,
      deletedAt: conversations.deletedAt,
    }).from(conversations).where(eq(conversations.id, id)).limit(1),
    memberIdsOf(id),
  ]);
  if (!spamCheck.allowed) return jsonError(429, spamCheck.reason ?? "Too many messages.");
  if (isDupe) return jsonError(429, "Duplicate message detected. Please wait before sending the same message again.");
  if (!detail || detail.deletedAt) return jsonError(404, "Conversation not found.");

  if (detail?.type === "group") {
    // Admin-only messaging
    if (detail.adminOnlyMessaging && membership.role === "member") {
      return jsonError(403, "Only admins can send messages in this group.");
    }

    // Slow mode
    if (detail.slowModeSeconds > 0 && membership.role !== "owner") {
      const lastMsg = detail.lastMessageAt ? new Date(detail.lastMessageAt).getTime() : 0;
      const elapsed = (Date.now() - lastMsg) / 1000;
      if (elapsed < detail.slowModeSeconds) {
        const waitSec = Math.ceil(detail.slowModeSeconds - elapsed);
        return jsonError(429, `Slow mode: wait ${waitSec} second${waitSec !== 1 ? "s" : ""} before sending another message.`);
      }
    }
  }

  // Blocking is enforced here on the server — never in the UI alone.
  if (detail?.type === "dm") {
    for (const other of members.filter((m) => m !== me.id)) {
      if (await isBlockedBetween(me.id, other)) {
        return jsonError(403, "You cannot send messages in this conversation.");
      }
    }
  }

  const message = await createMessage(
    id,
    me.id,
    parsed.data.text,
    parsed.data.replyToMessageId ?? null,
    parsed.data.forwarded,
    isEncrypted,
  );

  // Recipient already connected → the message is delivered on arrival.
  const online = await onlineMembersOf(id, me.id);
  if (online.length > 0) {
    message.deliveredAt = (await markMessageDelivered(message.id)).toISOString();
  }

  await publishToUsers(members, {
    type: "message:new",
    conversationId: id,
    message,
  });
  // Persist the message and realtime event before acknowledging it. Push
  // services and notification fan-out continue in Next's managed after task.
  after(async () => {
    await notifyNewMessage({
      conversationId: id,
      messageId: message.id,
      actorId: me.id,
      actorName: me.displayName,
      preview: isEncrypted
        ? "\u{1F512} Encrypted message"
        : parsed.data.text,
    });
    if (!isEncrypted) {
      const mentioned = await storeMessageMentions(message.id, id, parsed.data.text, me.id);
      await Promise.all(mentioned.map((user) => notifyUser(user.id, "mention", {
        conversationId: id,
        messageId: message.id,
        actorName: me.displayName,
        preview: parsed.data.text.slice(0, 140),
      }, me.id)));
    }
  });
  return NextResponse.json({ message }, { status: 201 });
}
