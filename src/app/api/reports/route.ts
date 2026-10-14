import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { createReport } from "@/server/privacy";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { db } from "@/db";
import { conversationMembers, conversations, messageDeletions, messages, reportReasonEnum, users } from "@/db/schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { isUuid } from "@/server/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  // Rate limit: 5 reports per minute per user
  const rl = await rateLimit(`report:${user.id}`, 5, 60_000);
  if (!rl.allowed) {
    return jsonError(429, "Too many reports. Please try again later.");
  }

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const data = body as Record<string, unknown>;
  const type = String(data.type || "");
  const reason = String(data.reason || "");
  const description = data.description ? String(data.description) : undefined;
  const targetUserId = data.targetUserId ? String(data.targetUserId) : undefined;
  const targetMessageId = data.targetMessageId ? String(data.targetMessageId) : undefined;

  if (!type || !reason) {
    return jsonError(422, "Type and reason are required.");
  }

  if (type !== "user" && type !== "message") {
    return jsonError(422, "Type must be 'user' or 'message'.");
  }

  if (type === "user" && !targetUserId) {
    return jsonError(422, "targetUserId is required for user reports.");
  }

  if (type === "message" && !targetMessageId) {
    return jsonError(422, "targetMessageId is required for message reports.");
  }
  if (!reportReasonEnum.enumValues.includes(reason as typeof reportReasonEnum.enumValues[number])) return jsonError(422, "Choose a valid report reason.");
  if (description && description.length > 5000) return jsonError(422, "Report description must be 5000 characters or shorter.");
  if ((targetUserId && !isUuid(targetUserId)) || (targetMessageId && !isUuid(targetMessageId))) return jsonError(422, "Choose a valid report target.");
  let verifiedTargetUserId = targetUserId;
  if (type === "message") {
    const [visible] = await db.select({ senderId: messages.senderId }).from(messages)
      .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, user.id)))
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(messages.id, targetMessageId!), isNull(messages.deletedAt), isNull(conversations.deletedAt),
        or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date())),
        or(isNull(conversationMembers.clearedAt), gt(messages.createdAt, conversationMembers.clearedAt)),
        sql`NOT EXISTS (SELECT 1 FROM ${messageDeletions} WHERE ${messageDeletions.messageId} = ${messages.id} AND ${messageDeletions.userId} = ${user.id})`)).limit(1);
    if (!visible) return jsonError(404, "Message not found.");
    verifiedTargetUserId = visible.senderId;
  } else {
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId!)).limit(1);
    if (!target) return jsonError(404, "User not found.");
  }

  const report = await createReport({
    reporterId: user.id,
    type: type as "user" | "message",
    reason,
    description,
    targetUserId: verifiedTargetUserId,
    targetMessageId: type === "message" ? targetMessageId : undefined,
  });

  return NextResponse.json(report, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
