import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { editMessageSchema, fieldErrors } from "@/lib/schemas";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  jsonError,
  readJson,
} from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { publishToConversation, publishToUsers } from "@/server/realtime";
import {
  deleteForMe,
  editMessage,
  getMembership,
  getMessageDTO,
  memberIdsOf,
  softDeleteMessage,
} from "@/server/chat";

export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  mode: z.enum(["for_me", "for_everyone"]),
});

/** Edit own message (sender only; deleted messages are immutable). */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `msg-edit:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit * 2,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Message not found.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const parsed = editMessageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      422,
      "Please fix the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const result = await editMessage(id, me.id, parsed.data.text);
  if (result === "not_found") return jsonError(404, "Message not found.");
  if (result === "forbidden") {
    return jsonError(403, "You can only edit your own messages.");
  }
  if (result === "deleted") {
    return jsonError(409, "Deleted messages cannot be edited.");
  }

  // Membership is implied by sendership, but verify for defense in depth.
  const membership = await getMembership(result.conversationId, me.id);
  if (!membership) return jsonError(404, "Message not found.");

  const dto = (await getMessageDTO(result.id, me.id))!;
  await publishToConversation(result.conversationId, {
    type: "message:update",
    conversationId: result.conversationId,
    message: dto,
  });
  return NextResponse.json({ message: dto });
}

/**
 * Delete a message — supports two modes:
 *  - "for_me": per-user soft-delete (message remains for others)
 *  - "for_everyone": sender-only global soft-delete (sets deletedAt)
 *
 * Defaults to "for_me" when no body is provided for backward compatibility.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Message not found.");

  // Parse optional body — default to "for_me" if no body or empty body
  let mode: "for_me" | "for_everyone" = "for_me";
  const body = await readJson(req);
  if (body) {
    const parsed = deleteSchema.safeParse(body);
    if (parsed.success) {
      mode = parsed.data.mode;
    } else {
      return jsonError(
        422,
        "Invalid deletion mode.",
        fieldErrors(parsed.error),
      );
    }
  }

  if (mode === "for_everyone") {
    const result = await softDeleteMessage(id, me.id);
    if (result === "not_found") return jsonError(404, "Message not found.");
    if (result === "forbidden") {
      return jsonError(
        403,
        "You can only delete your own messages for everyone.",
      );
    }

    const dto = await getMessageDTO(result.id, me.id);
    await publishToConversation(result.conversationId, {
      type: "message:delete",
      conversationId: result.conversationId,
      message: dto!,
    });
    return NextResponse.json({ message: dto });
  }

  // "for_me" mode — per-user deletion
  const result = await deleteForMe(id, me.id);
  if (result === "not_found") return jsonError(404, "Message not found.");

  const dto = await getMessageDTO(id, me.id);

  return NextResponse.json({ message: dto });
}
