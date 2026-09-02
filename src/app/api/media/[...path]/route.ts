import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMembers,
  messageAttachments,
  messageDeletions,
  messages,
  statuses,
} from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { jsonError } from "@/server/http";
import { readStored } from "@/server/storage";
import path from "path";
import { canViewStatus } from "@/server/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Authenticated media endpoint. Nothing under server/uploads is ever served
 * statically — every read passes through this handler, which verifies the
 * requester may see the file:
 *
 *  • `/api/media/<uuid>`               → message attachment: membership required
 *  • `/api/media/avatars/<file>`       → avatars: any signed-in user
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const segments = (await ctx.params).path ?? [];

  let relativePath: string;
  let mimeType = "application/octet-stream";
  let downloadName = "file";
  let inline = true;

  if (segments.length === 2 && segments[0] === "avatars") {
    const name = segments[1];
    // Server-generated names only: no separators, no traversal.
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
      return jsonError(404, "Not found.");
    }
    relativePath = path.posix.join("avatars", name);
    const ext = path.extname(name).toLowerCase();
    mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : "image/jpeg";
    downloadName = name;
  } else if (segments.length === 2 && segments[0] === "status" && isUuid(segments[1])) {
    const rows = await db.select().from(statuses).where(eq(statuses.id, segments[1])).limit(1);
    const status = rows[0];
    if (!status?.mediaPath || !(await canViewStatus(status, me.id))) return jsonError(404, "Not found.");
    relativePath = status.mediaPath;
    mimeType = status.mediaMimeType ?? "image/jpeg";
    downloadName = path.basename(status.mediaPath);
  } else if (segments.length === 1 && isUuid(segments[0])) {
    const rows = await db
      .select({ attachment: messageAttachments, message: messages })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(eq(messageAttachments.id, segments[0]))
      .limit(1);
    const found = rows[0];
    if (!found) return jsonError(404, "Not found.");

    // Authorization: the viewer must belong to the owning conversation.
    const membership = await db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, found.message.conversationId),
          eq(conversationMembers.userId, me.id),
        ),
      )
      .limit(1);
    if (membership.length === 0) return jsonError(404, "Not found.");

    // Deleted messages stop serving their attachments.
    if (found.message.deletedAt) return jsonError(404, "Not found.");

    // A per-user deletion also revokes that user's direct attachment URL.
    const hidden = await db
      .select({ id: messageDeletions.id })
      .from(messageDeletions)
      .where(
        and(
          eq(messageDeletions.messageId, found.message.id),
          eq(messageDeletions.userId, me.id),
        ),
      )
      .limit(1);
    if (hidden.length > 0) return jsonError(404, "Not found.");

    relativePath = found.attachment.path;
    mimeType = found.attachment.mimeType;
    downloadName = found.attachment.originalName;
    inline =
      found.attachment.kind === "image" || found.attachment.kind === "video";
  } else {
    return jsonError(404, "Not found.");
  }

  const stored = await readStored(relativePath);
  if (!stored) return jsonError(404, "Not found.");

  return new Response(stored.body as BodyInit, {
    headers: {
      "Content-Type": mimeType,
      ...(stored.size !== null ? { "Content-Length": String(stored.size) } : {}),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${downloadName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
