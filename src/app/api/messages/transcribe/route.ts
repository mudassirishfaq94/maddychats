import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, messageAttachments, messageDeletions, messages } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { isUuid } from "@/server/users";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Legacy plaintext audio only. Encrypted voice transcripts remain device-local. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const rl = await rateLimit(`transcript:${user.id}`, 30, 60_000);
  if (!rl.allowed) return jsonError(429, "Too many transcript requests.");
  const body = await readJson(req);
  const attachmentId = body?.attachmentId;
  if (typeof attachmentId !== "string" || !isUuid(attachmentId)) return jsonError(422, "A valid attachmentId is required.");
  const transcript = body?.transcript;
  if (transcript !== undefined && (typeof transcript !== "string" || !transcript.trim() || transcript.length > 5000)) {
    return jsonError(422, "Transcript must contain 1–5000 characters.");
  }
  return db.transaction(async (tx) => {
    const [found] = await tx.select({ attachment: messageAttachments, message: messages })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, user.id)))
      .where(and(eq(messageAttachments.id, attachmentId), isNull(messages.deletedAt),
        or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date())),
        or(isNull(conversationMembers.clearedAt), gt(messages.createdAt, conversationMembers.clearedAt)),
        sql`NOT EXISTS (SELECT 1 FROM ${messageDeletions} WHERE ${messageDeletions.messageId} = ${messages.id} AND ${messageDeletions.userId} = ${user.id})`))
      .for("update", { of: messageAttachments });
    if (!found) return jsonError(404, "Attachment not found.");
    if (found.attachment.kind !== "audio") return jsonError(422, "Only audio attachments have transcripts.");
    if (found.attachment.encrypted || found.message.encrypted) return jsonError(422, "Encrypted voice transcripts stay on your device.");
    if (typeof transcript === "string") {
      if (found.message.senderId !== user.id) return jsonError(403, "Only the sender can change this transcript.");
      await tx.update(messageAttachments).set({ transcript: transcript.trim() }).where(eq(messageAttachments.id, attachmentId));
    }
    return NextResponse.json({ transcript: typeof transcript === "string" ? transcript.trim() : found.attachment.transcript }, { headers: { "Cache-Control": "no-store" } });
  });
}
