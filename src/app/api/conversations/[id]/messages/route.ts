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

  // The instrumentation maintenance worker delivers due messages every ten
  // seconds. History reads must not scan the global job queue or start
  // unobserved promises alongside every request.

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.floor(limitParam)
      : MESSAGE_PAGE_SIZE;
  const cursor = decodeCursor(req.nextUrl.searchParams.get("cursor"));

  const started = performance.now();
  const page = await listMessages(id, cursor, limit, me.id);
  return NextResponse.json(page, { headers: { "Server-Timing": `history;dur=${(performance.now() - started).toFixed(1)}`, "Cache-Control": "no-store" } });
}

/** Send a text message (optionally replying to another). Members only. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const startedAt = performance.now();
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  // Revocation/MFA reads and the shared rate counter are independent.
  const [rl, me] = await Promise.all([
    rateLimit(`msg-send:${clientIp(req)}`, AUTH_RATE_LIMIT.limit * 4, AUTH_RATE_LIMIT.windowMs),
    getSessionUser(),
  ]);
  if (!rl.allowed) return jsonError(429, "You are sending messages too quickly.");
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

  if (parsed.data.expectedSenderId && parsed.data.expectedSenderId !== me.id) return jsonError(409, "Sign in to the original account to send this queued message.");

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
    request_pending: boolean;
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
        bool_or(members.accepted_at is null) as request_pending,
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

  if (parsed.data.selfDestruct && detail.type === "dm" && detail.request_pending) return jsonError(403, "Accept the request before sending a self-destruct message.");
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
      selfDestruct: parsed.data.selfDestruct,
      deliveredAt: null,
      sender: me,
      realtimeRecipients: members,
      enforceMessageRequest: detail.type === "dm" && detail.request_pending,
    },
  ).catch((cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("MESSAGE_REQUEST_")) return null;
    throw cause;
  });
  if (!createdResult) return jsonError(403, "Your message request is waiting for approval. You can send more messages after it is accepted.");
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

  // The durable realtime event now commits in the message statement. LISTEN
  // wakes recipients immediately; a failed event write cannot acknowledge a
  // message that would be invisible to the realtime stream.
  const publishedAt = performance.now();
  // Persist the message and realtime event before acknowledging it. Push
  // services and notification fan-out continue in Next's managed after task.
  const notify = async () => {
    await notifyNewMessage({
      conversationId: id,
      messageId: message.id,
      actorId: me.id,
      actorName: me.displayName,
      persistedRequest: detail.type === "dm" && detail.request_pending,
      // A message request is a fixed notice, not private message text.
      encrypted: detail.type === "dm" && detail.request_pending ? false : isEncrypted,
      preview: detail.type === "dm" && detail.request_pending
        ? "Message request — accept to continue the conversation"
        : isEncrypted
        ? "New encrypted message"
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
  };
  // Request notifications are already committed in the introduction's
  // transaction. Realtime notification delivery and push stay off the ack path.
  after(notify);
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
