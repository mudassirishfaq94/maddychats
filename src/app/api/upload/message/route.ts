import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, messageAttachments, messages } from "@/db/schema";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  guardUploadSize,
  jsonError,
} from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { publishToConversation } from "@/server/realtime";
import { onlineMembersOf } from "@/server/presence";
import {
  getMembership,
  getMessageDTO,
  markMessageDelivered,
  memberIdsOf,
  isBlockedBetween,
} from "@/server/chat";
import { notifyNewMessage } from "@/server/notifications";
import {
  deleteStored,
  generateStoredName,
  LIMITS,
  saveBuffer,
  validateUpload,
} from "@/server/storage";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Uploads one or more attachments and posts them as a message.
 * Requires authentication AND conversation membership.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const oversized = guardUploadSize(req);
  if (oversized) return oversized;

  const rl = rateLimit(
    `upload-msg:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit * 2,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) return jsonError(429, "Too many uploads. Try again later.");

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Invalid upload.");
  }

  const conversationId = String(form.get("conversationId") ?? "");
  if (!isUuid(conversationId)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(conversationId, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  // Blocking is enforced server-side, never in the UI alone.
  const members = await memberIdsOf(conversationId);
  const others = members.filter((id) => id !== me.id);
  for (const other of others) {
    if (await isBlockedBetween(me.id, other)) {
      return jsonError(403, "You cannot send messages in this conversation.");
    }
  }

  const caption = String(form.get("text") ?? "").trim().slice(0, 2000);
  const replyRaw = String(form.get("replyToMessageId") ?? "");
  const replyToMessageId = isUuid(replyRaw) ? replyRaw : null;

  const entries = form
    .getAll("files")
    .filter((f): f is File => typeof f !== "string" && f !== null);
  if (entries.length === 0) {
    return jsonError(422, "Choose at least one file to send.");
  }
  if (entries.length > 5) {
    return jsonError(422, "You can attach up to 5 files at a time.");
  }

  // Validate everything BEFORE writing anything to disk.
  const prepared: {
    file: File;
    storedName: string;
    kind: "image" | "video" | "file" | "audio";
    safeName: string;
  }[] = [];
  for (const file of entries) {
    const check = validateUpload(file.name, file.type, file.size, "message");
    if (!check.ok) return jsonError(422, check.error, { file: check.error });
    prepared.push({
      file,
      storedName: generateStoredName(check.extension),
      kind: check.kind,
      safeName: check.safeName,
    });
  }

  // Reply target must live in this conversation.
  let validReplyId: string | null = null;
  if (replyToMessageId) {
    const parent = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.id, replyToMessageId))
      .limit(1);
    const parentConv = parent[0]
      ? await db
          .select({ conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.id, replyToMessageId))
          .limit(1)
      : [];
    if (parentConv[0]?.conversationId === conversationId) {
      validReplyId = replyToMessageId;
    }
  }

  const written: string[] = [];
  try {
    const messageType: string = prepared.every((p) => p.kind === "image")
      ? "image"
      : prepared.every((p) => p.kind === "video")
        ? "video"
        : prepared.every((p) => p.kind === "audio")
          ? "audio"
          : "file";

    const created = await db.transaction(async (tx) => {
      const now = new Date();
      const rows = await tx
        .insert(messages)
        .values({
          conversationId,
          senderId: me.id,
          text: caption,
          type: messageType,
          replyToMessageId: validReplyId,
        })
        .returning();
      const message = rows[0];

      for (const item of prepared) {
        const buffer = Buffer.from(await item.file.arrayBuffer());
        const limit = item.kind === "image" ? LIMITS.image : LIMITS.file;
        if (buffer.byteLength > limit) throw new Error("too_large");

        const bucket = item.kind === "image" ? "images" : "files";
        const attachmentKind: string = item.kind === "audio" ? "audio" : item.kind;
        const relative = await saveBuffer(bucket, item.storedName, buffer);
        written.push(relative);

        await tx.insert(messageAttachments).values({
          messageId: message.id,
          originalName: item.safeName,
          storedName: item.storedName,
          mimeType: item.file.type,
          size: buffer.byteLength,
          path: relative,
          kind: attachmentKind,
        });
      }

      await tx
        .update(messages)
        .set({ updatedAt: now })
        .where(eq(messages.id, message.id));
      return message;
    });

    // Conversation ordering.
    const now = new Date();
    await db
      .update(conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(conversations.id, conversationId));

    const online = await onlineMembersOf(conversationId, me.id);
    if (online.length > 0) await markMessageDelivered(created.id);

    const dto = (await getMessageDTO(created.id, me.id))!;
    await publishToConversation(conversationId, {
      type: "message:new",
      conversationId,
      message: dto,
    });
    await notifyNewMessage({
      conversationId,
      messageId: created.id,
      actorId: me.id,
      actorName: me.displayName,
      preview: caption || `Sent ${prepared.length} attachment(s)`,
    });

    return NextResponse.json({ message: dto }, { status: 201 });
  } catch (err) {
    // Best-effort cleanup of partial writes.
    await Promise.all(written.map((p) => deleteStored(p)));
    if ((err as Error)?.message === "too_large") {
      return jsonError(413, "That file is too large.");
    }
    console.error("[maddy-chats] attachment upload failed:", err);
    return jsonError(500, "Upload failed. Please try again.");
  }
}
