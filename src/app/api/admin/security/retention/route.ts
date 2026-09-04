import { NextRequest, NextResponse } from "next/server";
import { sql, lte, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, messageAttachments, scheduledMessages, adminAuditLog } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const [{ totalMessages }] = await db.select({ totalMessages: sql<number>`count(*)::int` }).from(messages);
  const [{ messagesOlderThan90d }] = await db.select({ messagesOlderThan90d: sql<number>`count(*)::int` }).from(messages).where(lte(messages.createdAt, ninetyDaysAgo));
  const [{ messagesOlderThan180d }] = await db.select({ messagesOlderThan180d: sql<number>`count(*)::int` }).from(messages).where(lte(messages.createdAt, oneEightyDaysAgo));
  const [{ totalAttachments }] = await db.select({ totalAttachments: sql<number>`count(*)::int` }).from(messageAttachments);
  const [{ attachmentsOlderThan90d }] = await db.select({ attachmentsOlderThan90d: sql<number>`count(*)::int` }).from(messageAttachments).where(lte(messageAttachments.createdAt, ninetyDaysAgo));
  const [{ scheduledCount }] = await db.select({ scheduledCount: sql<number>`count(*)::int` }).from(scheduledMessages).where(eq(scheduledMessages.sent, false));
  const [{ oldAuditCount }] = await db.select({ oldAuditCount: sql<number>`count(*)::int` }).from(adminAuditLog).where(lte(adminAuditLog.createdAt, oneYearAgo));

  return NextResponse.json({
    totalMessages,
    messagesOlderThan90d,
    messagesOlderThan180d,
    totalAttachments,
    attachmentsOlderThan90d,
    scheduledMessages: scheduledCount,
    oldAuditLogs: oldAuditCount,
  });
}
