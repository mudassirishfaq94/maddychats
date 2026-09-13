import { after, NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
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
import { isOnline } from "@/server/presence";
import {
  createMessage,
  decodeCursor,
  getMembership,
  listMessages,
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
  const startedAt = performance.now();
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = await rateLimit(
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
  if (!isEncrypted) {
    return jsonError(422, "End-to-end encrypted message payload required.");
  }
  // Independent reads run together; sending does not need member profiles,
  // backgrounds, or the other detail fields loaded by the chat page.
  const validationDoneAt = performance.now();
  type SendContext = {
    type: "dm" | "group";
    role: string;
    admin_only_messaging: boolean;
    slow_mode_seconds: number;
    last_message_at: Date | null;
    deleted_at: Date | null;
    disappearing_seconds: number;
    member_ids: string[];
    blocked: boolean;
  };
  const [spamCheck, isDupe, contextResult] = await Promise.all([
    isSpammingMessages(me.id),
    !isEncrypted && parsed.data.text
      ? isDuplicateMessage(me.id, parsed.data.text, id)
      : Promise.resolve(false),
    db.execute<SendContext>(sql`
      select c.type, mine.role,
        c.admin_only_messaging, c.slow_mode_seconds, c.last_message_at,
        c.deleted_at, c.disappearing_seconds,
        array_agg(members.user_id order by members.joined_at) as member_ids,
        exists (
          select 1 from blocks b
          join conversation_members peer
            on peer.conversation_id = c.id and peer.user_id <> ${me.id}
          where (b.blocker_id = ${me.id} and b.blocked_id = peer.user_id)
             or (b.blocker_id = peer.user_id and b.blocked_id = ${me.id})
        ) as blocked
      from conversations c
      join conversation_members mine
        on mine.conversation_id = c.id and mine.user_id = ${me.id}
      join conversation_members members on members.conversation_id = c.id
      where c.id = ${id}
      group by c.id, mine.role
    `),
  ]);
  const detail = contextResult.rows[0];
  const members = detail?.member_ids ?? [];
  if (!spamCheck.allowed) return jsonError(429, spamCheck.reason ?? "Too many messages.");
  if (isDupe) return jsonError(429, "Duplicate message detected. Please wait before sending the same message again.");
  if (!detail || detail.deleted_at) return jsonError(404, "Conversation not found.");

  if (detail?.type === "group") {
    // Admin-only messaging
    if (detail.admin_only_messaging && detail.role === "member") {
      return jsonError(403, "Only admins can send messages in this group.");
    }

    // Slow mode
    if (detail.slow_mode_seconds > 0 && detail.role !== "owner") {
      const lastMsg = detail.last_message_at ? new Date(detail.last_message_at).getTime() : 0;
      const elapsed = (Date.now() - lastMsg) / 1000;
      if (elapsed < detail.slow_mode_seconds) {
        const waitSec = Math.ceil(detail.slow_mode_seconds - elapsed);
        return jsonError(429, `Slow mode: wait ${waitSec} second${waitSec !== 1 ? "s" : ""} before sending another message.`);
      }
    }
  }

  // Blocking is enforced here on the server — never in the UI alone.
  if (detail.type === "dm" && detail.blocked) {
    return jsonError(403, "You cannot send messages in this conversation.");
  }

  const contextDoneAt = performance.now();
  const createdResult = await createMessage(
    id,
    me.id,
    parsed.data.text,
    parsed.data.replyToMessageId ?? null,
    parsed.data.forwarded,
    isEncrypted,
    {
      clientMessageId: parsed.data.clientMessageId,
      disappearingSeconds: detail.disappearing_seconds,
      deliveredAt: members.some((memberId) => memberId !== me.id && isOnline(memberId))
        ? new Date()
        : null,
      sender: me,
    },
  );
  const message = createdResult.message;
  const persistedAt = performance.now();

  // Network retries return the committed row without publishing a duplicate
  // realtime event or notification.
  if (!createdResult.created) {
    return NextResponse.json({ message }, {
      status: 200,
      headers: { "Server-Timing": `total;dur=${(persistedAt - startedAt).toFixed(1)}` },
    });
  }

  await publishToUsers(members, {
    type: "message:new",
    conversationId: id,
    message,
  });
  const publishedAt = performance.now();
  // Persist the message and realtime event before acknowledging it. Push
  // services and notification fan-out continue in Next's managed after task.
  after(async () => {
    await notifyNewMessage({
      conversationId: id,
      messageId: message.id,
      actorId: me.id,
      actorName: me.displayName,
      preview: isEncrypted
        ? "New message"
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
  return NextResponse.json({ message }, {
    status: 201,
    headers: {
      "Server-Timing": [
        `validate;dur=${(validationDoneAt - startedAt).toFixed(1)}`,
        `context;dur=${(contextDoneAt - validationDoneAt).toFixed(1)}`,
        `persist;dur=${(persistedAt - contextDoneAt).toFixed(1)}`,
        `publish;dur=${(publishedAt - persistedAt).toFixed(1)}`,
        `total;dur=${(publishedAt - startedAt).toFixed(1)}`,
      ].join(", "),
    },
  });
}
