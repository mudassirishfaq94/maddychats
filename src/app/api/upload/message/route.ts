import { safeError } from "@/server/safe-error";
import { readUploadForm } from "@/server/http";
import { after, NextRequest, NextResponse } from "next/server";
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
import { publishToUsers } from "@/server/realtime";
import { onlineMembersOf } from "@/server/presence";
import {
  getMembership,
  getConversationForUser,
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
  sanitizeName,
} from "@/server/storage";
import { eq, sql } from "drizzle-orm";
import { ENCRYPTED_MEDIA_OVERHEAD, MEDIA_MAX_BYTES } from "@/lib/media-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Uploads one or more attachments and posts them as a message.
 * Requires authentication AND conversation membership.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const oversized = guardUploadSize(req, true);
  if (oversized) return oversized;

  const rl = await rateLimit(
    `upload-msg:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit * 2,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) return jsonError(429, "Too many uploads. Try again later.");

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`encrypted-upload:${me.id}`, 10, 60000)).allowed) return jsonError(429, "Too many uploads. Try again later.");

  let form: FormData;
  try {
    form = await readUploadForm(req);
  } catch (error) {
    return jsonError(error instanceof Error && error.message === "body_too_large" ? 413 : 400, "Invalid or oversized upload.");
  }

  const conversationId = String(form.get("conversationId") ?? "");
  if (!isUuid(conversationId)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(conversationId, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conversation || conversation.deletedAt) return jsonError(404, "Conversation not found.");
  if (conversation.type === "dm") {
    const detail = await getConversationForUser(conversationId, me.id);
    if (detail?.requestPending || detail?.awaitingApproval) return jsonError(403, "Send one text introduction, then wait for approval before sharing attachments.");
  }
  if (conversation.adminOnlyMessaging && !["owner", "admin"].includes(membership.role)) return jsonError(403, "Only group admins can send messages.");

  // Blocking is enforced server-side, never in the UI alone.
  const members = await memberIdsOf(conversationId);
  const others = members.filter((id) => id !== me.id);
  for (const other of others) {
    if (await isBlockedBetween(me.id, other)) {
      return jsonError(403, "You cannot send messages in this conversation.");
    }
  }

  const isEncrypted = form.get("encrypted") === "true";
  if (!isEncrypted) {
    return jsonError(422, "End-to-end encrypted attachment payload required.");
  }
  // When encrypting, the caption (if any) is E2EE ciphertext produced client-side.
  const caption = String(form.get("text") ?? "").trim().slice(0, 4000);
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
  if (entries.reduce((total, file) => total + file.size, 0) > MEDIA_MAX_BYTES + entries.length * ENCRYPTED_MEDIA_OVERHEAD) return jsonError(413, "Attachments must total 10 MB or less. Send larger batches separately.");

  // Per-file wrapped media keys and original mime types (aligned with files).
  const wrappedKeys = form
    .getAll("keys")
    .map((v) => (typeof v === "string" && v.length > 0 ? v : null));
  const origTypes = form
    .getAll("origTypes")
    .map((v) => (typeof v === "string" ? v : "application/octet-stream"));

  // Validate everything BEFORE writing anything to disk.
  const prepared: {
    file: File;
    storedName: string;
    kind: "image" | "video" | "file" | "audio";
    safeName: string;
    originalMime: string;
    wrappedKey: string | null;
  }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const file = entries[i];
    if (isEncrypted) {
      // Encrypted payloads arrive as opaque bytes — the server must never
      // inspect or validate content it cannot read.
      const originalMime =
        origTypes[i]?.trim().toLowerCase().split(";")[0] ??
        "application/octet-stream";
      if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(originalMime) || originalMime.length > 100) return jsonError(422, "Invalid media type.");
      if (file.size < 29 || file.size > LIMITS.file + ENCRYPTED_MEDIA_OVERHEAD) return jsonError(413, "Attachments must be 10 MB or smaller.");
      const metadataCheck = validateUpload(file.name, originalMime, file.size - ENCRYPTED_MEDIA_OVERHEAD, "message");
      if (!metadataCheck.ok) return jsonError(422, metadataCheck.error);
      if (!wrappedKeys[i] || wrappedKeys[i]!.length > 16384) return jsonError(422, "An encrypted media key is required.");
      let kind: "image" | "video" | "file" | "audio" = "file";
      if (originalMime.startsWith("audio/")) kind = "audio";
      else if (originalMime.startsWith("image/")) kind = "image";
      else if (originalMime.startsWith("video/")) kind = "video";
      const safeName = sanitizeName(file.name);
      prepared.push({
        file,
        storedName: generateStoredName(""),
        kind,
        safeName: safeName || "encrypted-media.bin",
        originalMime,
        wrappedKey: wrappedKeys[i] ?? null,
      });
    } else {
      const check = validateUpload(file.name, file.type, file.size, "message");
      if (!check.ok) return jsonError(422, check.error, { file: check.error });
      prepared.push({
        file,
        storedName: generateStoredName(check.extension),
        kind: check.kind,
        safeName: check.safeName,
        originalMime: file.type,
        wrappedKey: null,
      });
    }
  }

  // Reply target must live in this conversation.
  let validReplyId: string | null = null;
  if (replyToMessageId) {
    const parent = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, replyToMessageId))
      .limit(1);
    if (parent[0]?.conversationId === conversationId) {
      validReplyId = replyToMessageId;
    }
  }

  const written: string[] = [];
  let committed = false;
  try {
    const messageType: string = prepared.every((p) => p.kind === "image")
      ? "image"
      : prepared.every((p) => p.kind === "video")
        ? "video"
        : prepared.every((p) => p.kind === "audio")
          ? "audio"
          : "file";

    const created = await db.transaction(async (tx) => {
      // Serialize quota reservations with the attachment inserts, including concurrent senders.
      await tx.execute(sql`select pg_advisory_xact_lock(847221904)`);
      const usage = await tx.execute<{ bytes: string }>(sql`select coalesce(sum(size),0)::text as bytes from message_attachments`);
      const budgetMb = Number(process.env.CHAT_STORAGE_BUDGET_MB ?? "400");
      const budget = (Number.isFinite(budgetMb) && budgetMb > 0 ? budgetMb : 400) * 1024 * 1024;
      if (Number(usage.rows[0]?.bytes ?? 0) + prepared.reduce((total, item) => total + item.file.size, 0) > budget) throw new Error("storage_budget");
      const now = new Date();
      const rows = await tx
        .insert(messages)
        .values({
          conversationId,
          senderId: me.id,
          text: caption,
          type: messageType,
          replyToMessageId: validReplyId,
          encrypted: isEncrypted,
          forwarded: form.get("forwarded") === "true",
        })
        .returning();
      const message = rows[0];

      for (const item of prepared) {
        const buffer = Buffer.from(await item.file.arrayBuffer());
        const limit = LIMITS.file + ENCRYPTED_MEDIA_OVERHEAD;
        if (buffer.byteLength > limit) throw new Error("too_large");

        const bucket = item.kind === "image" ? "images" : "files";
        const attachmentKind: string = item.kind === "audio" ? "audio" : item.kind;
        const relative = await saveBuffer(bucket, item.storedName, buffer);
        written.push(relative);

        await tx.insert(messageAttachments).values({
          messageId: message.id,
          originalName: item.safeName,
          storedName: item.storedName,
          mimeType: item.originalMime,
          size: buffer.byteLength,
          path: relative,
          kind: attachmentKind,
          encrypted: isEncrypted,
          encKey: item.wrappedKey,
        });
      }

      await tx
        .update(messages)
        .set({ updatedAt: now })
        .where(eq(messages.id, message.id));
      return message;
    });

    committed = true;
    // Conversation ordering.
    const now = new Date();
    await db
      .update(conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(conversations.id, conversationId));

    const online = await onlineMembersOf(conversationId, me.id);
    if (online.length > 0) await markMessageDelivered(created.id);

    const dto = (await getMessageDTO(created.id, me.id))!;
    await publishToUsers(members, {
      type: "message:new",
      conversationId,
      message: dto,
    });
    after(async () => {
      await notifyNewMessage({
        conversationId,
        messageId: created.id,
        actorId: me.id,
        actorName: me.displayName,
        preview: isEncrypted
          ? caption
            ? "New attachment"
            : `${prepared.length === 1 ? "Attachment" : "Attachments"}`
          : caption || `Sent ${prepared.length} attachment(s)`,
      });
    });

    return NextResponse.json({ message: dto }, { status: 201 });
  } catch (err) {
    // Best-effort cleanup of partial writes.
    if (!committed) await Promise.all(written.map((p) => deleteStored(p)));
    if ((err as Error)?.message === "too_large") {
      return jsonError(413, "That file is too large.");
    }
    if ((err as Error)?.message === "storage_budget") return jsonError(507, "Chat storage is full. No attachment was sent.");
    console.error("[maddy-chats] attachment upload failed:", safeError(err));
    return jsonError(500, "Upload failed. Please try again.");
  }
}
