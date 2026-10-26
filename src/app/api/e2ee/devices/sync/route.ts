import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations, conversationMembers, e2eeKeys } from "@/db/schema";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const session = await getSessionDeviceId();
  if (!session) return jsonError(403, "Sign in again.");
  const [trusted] = await db.select({ id: e2eeKeys.id }).from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.sessionId, session), isNotNull(e2eeKeys.trustedAt))).limit(1);
  if (!trusted) return jsonError(403, "Use a trusted browser.");
  if (!(await rateLimit(`device-sync:${user.id}`, 5, 60000)).allowed) return jsonError(429, "Wait before synchronizing again.");
  const rows = await db.select({ id: conversations.id }).from(conversations).innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
    .where(and(eq(conversationMembers.userId, user.id), isNull(conversations.deletedAt))).orderBy(desc(conversations.lastMessageAt));
  return Response.json({ conversationIds: rows.map(row => row.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
