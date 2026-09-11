import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { isUuid } from "@/server/users";
import {
  applyConversationControl,
  clearConversationForUser,
  setDisappearingMessages,
  type ConversationControl,
} from "@/server/chat";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum([
    "pin",
    "unpin",
    "mute",
    "unmute",
    "archive",
    "unarchive",
    "markUnread",
    "markRead",
    "setDisappearing",
    "clear",
  ]),
  disappearingSeconds: z.union([z.literal(0), z.literal(86400), z.literal(604800), z.literal(2592000)]).optional(),
});

/**
 * Per-user conversation controls: pin, mute, archive, mark unread, and
 * "delete for me" (clear). All state is stored on the caller's own
 * membership row, so it never affects the other participant.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Unknown action.");

  if (parsed.data.action === "clear") {
    const result = await clearConversationForUser(id, me.id);
    if (!result) return jsonError(404, "Conversation not found.");
    return NextResponse.json({ ok: true, result });
  }

  if (parsed.data.disappearingSeconds !== undefined) {
    const ok = await setDisappearingMessages(id, me.id, parsed.data.disappearingSeconds);
    if (!ok) return jsonError(404, "Conversation not found.");
    return NextResponse.json({ ok: true, disappearingSeconds: parsed.data.disappearingSeconds });
  }

  const ok = await applyConversationControl(
    id,
    me.id,
    parsed.data.action as ConversationControl,
  );
  if (!ok) return jsonError(404, "Conversation not found.");

  return NextResponse.json({ ok: true, action: parsed.data.action });
}
