import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, startConversationSchema } from "@/lib/schemas";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";
import { getSessionUser } from "@/server/session";
import { findUserById } from "@/server/users";
import { publishToUsers } from "@/server/realtime";
import {
  createDirectConversation,
  getConversationForUser,
  isBlockedBetween,
  listConversationsFor,
} from "@/server/chat";

export const dynamic = "force-dynamic";

/** All conversations the viewer belongs to, most recently active first. */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const list = await listConversationsFor(me.id);
  return NextResponse.json({ conversations: list });
}

/**
 * Start a direct conversation with another user. De-duplicated: starting a
 * chat that already exists returns the existing conversation (never a
 * duplicate).
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `conv-create:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = startConversationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const targetId = parsed.data.userId;
  if (targetId === me.id) {
    return jsonError(422, "You cannot start a chat with yourself.", {
      userId: "You cannot start a chat with yourself",
    });
  }

  const target = await findUserById(targetId);
  if (!target) return jsonError(404, "User not found.");

  // Blocked users cannot start conversations with each other.
  if (await isBlockedBetween(me.id, target.id)) {
    return jsonError(403, "You cannot start a conversation with this user.");
  }

  const { conversation, created } = await createDirectConversation(
    me.id,
    target.id,
  );
  const detail = await getConversationForUser(conversation.id, me.id);

  if (created) {
    // Let both members' sidebars light up immediately.
    publishToUsers([me.id, target.id], {
      type: "conversation:new",
      conversationId: conversation.id,
    });
  }

  return NextResponse.json(
    { conversation: detail, created },
    { status: created ? 201 : 200 },
  );
}
