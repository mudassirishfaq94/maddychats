import { and, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, statusReactions, statusRecipients, statuses, statusViews, users, type StatusRow } from "@/db/schema";
import type { StatusDTO } from "@/lib/types";
import { deleteStored } from "./storage";
import { toPublicUser } from "./users";

const DAY_MS = 24 * 60 * 60 * 1000;

function dto(row: StatusRow, owner: typeof users.$inferSelect, viewed: boolean, viewCount: number, reactions: StatusDTO["reactions"] = []): StatusDTO {
  return {
    id: row.id, userId: row.userId, type: row.type, text: row.text,
    mediaUrl: row.mediaPath ? `/api/media/status/${row.id}` : null,
    backgroundStyle: row.backgroundStyle, privacy: row.privacy,
    createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    viewed, viewCount, owner: toPublicUser(owner), reactions,
  };
}

export function statusExpiry(createdAt = new Date()) { return new Date(createdAt.getTime() + DAY_MS); }

async function blockedBetween(a: string, b: string) {
  const rows = await db.select({ id: blocks.id }).from(blocks).where(or(
    and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
    and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
  )).limit(1);
  return rows.length > 0;
}

export async function canViewStatus(row: StatusRow, viewerId: string) {
  if (row.expiresAt <= new Date()) return false;
  if (row.userId === viewerId) return true;
  if (await blockedBetween(row.userId, viewerId)) return false;
  if (row.privacy === "all") return true;
  const selected = await db.select({ id: statusRecipients.id }).from(statusRecipients)
    .where(and(eq(statusRecipients.statusId, row.id), eq(statusRecipients.userId, viewerId))).limit(1);
  return selected.length > 0;
}

export async function createStatus(input: {
  userId: string; type: "text" | "image" | "video"; text?: string | null; mediaPath?: string | null;
  mediaMimeType?: string | null; backgroundStyle?: string | null; privacy: "all" | "selected"; selectedUserIds?: string[];
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(statuses).values({
      userId: input.userId, type: input.type, text: input.text?.trim() || null,
      mediaPath: input.mediaPath ?? null, mediaMimeType: input.mediaMimeType ?? null,
      backgroundStyle: input.backgroundStyle ?? null, privacy: input.privacy,
      createdAt: now, expiresAt: statusExpiry(now),
    }).returning();
    const selected = [...new Set(input.selectedUserIds ?? [])].filter((id) => id !== input.userId);
    if (input.privacy === "selected" && selected.length) {
      await tx.insert(statusRecipients).values(selected.map((userId) => ({ statusId: row.id, userId }))).onConflictDoNothing();
    }
    return row;
  });
}

export async function visibleRecipientIds(row: StatusRow) {
  let ids: string[];
  if (row.privacy === "selected") {
    const selected = await db.select({ userId: statusRecipients.userId }).from(statusRecipients).where(eq(statusRecipients.statusId, row.id));
    ids = selected.map((r) => r.userId);
  } else {
    const all = await db.select({ id: users.id }).from(users).where(ne(users.id, row.userId)); ids = all.map((r) => r.id);
  }
  const blockRows = await db.select().from(blocks).where(or(eq(blocks.blockerId, row.userId), eq(blocks.blockedId, row.userId)));
  const blocked = new Set(blockRows.map((b) => b.blockerId === row.userId ? b.blockedId : b.blockerId));
  return [row.userId, ...ids.filter((id) => !blocked.has(id))];
}

export async function listVisibleStatuses(viewerId: string) {
  const rows = await db.select({ status: statuses, owner: users }).from(statuses)
    .innerJoin(users, eq(statuses.userId, users.id)).where(gt(statuses.expiresAt, new Date())).orderBy(desc(statuses.createdAt));
  const visible: typeof rows = [];
  for (const row of rows) if (await canViewStatus(row.status, viewerId)) visible.push(row);
  if (!visible.length) return [];
  const ids = visible.map((r) => r.status.id);
  const [views, counts, reactionRows] = await Promise.all([
    db.select({ statusId: statusViews.statusId }).from(statusViews).where(and(inArray(statusViews.statusId, ids), eq(statusViews.viewerId, viewerId))),
    db.select({ statusId: statusViews.statusId, count: sql<string>`count(*)::text` }).from(statusViews).where(inArray(statusViews.statusId, ids)).groupBy(statusViews.statusId),
    db.select({ statusId: statusReactions.statusId, userId: statusReactions.userId, emoji: statusReactions.emoji }).from(statusReactions).where(inArray(statusReactions.statusId, ids)),
  ]);
  const viewed = new Set(views.map((v) => v.statusId)); const count = new Map(counts.map((v) => [v.statusId, Number(v.count)]));
  const reactionMap = new Map<string, Map<string, { emoji: string; count: number; mine: boolean }>>();
  for (const reaction of reactionRows) { const group = reactionMap.get(reaction.statusId) ?? new Map(); const item = group.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false }; item.count++; if (reaction.userId === viewerId) item.mine = true; group.set(reaction.emoji, item); reactionMap.set(reaction.statusId, group); }
  return visible.map((r) => dto(r.status, r.owner, viewed.has(r.status.id), count.get(r.status.id) ?? 0, [...(reactionMap.get(r.status.id)?.values() ?? [])]));
}

export async function findVisibleStatus(id: string, viewerId: string) {
  const [row] = await db.select({ status: statuses, owner: users }).from(statuses).innerJoin(users, eq(statuses.userId, users.id)).where(eq(statuses.id, id)).limit(1);
  if (!row || !(await canViewStatus(row.status, viewerId))) return null;
  return row;
}

export async function markStatusViewed(id: string, viewerId: string) {
  const row = await findVisibleStatus(id, viewerId); if (!row) return "not_found" as const;
  if (row.status.userId === viewerId) return "owner" as const;
  await db.insert(statusViews).values({ statusId: id, viewerId }).onConflictDoNothing();
  return "ok" as const;
}

export async function deleteOwnStatus(id: string, userId: string) {
  const [row] = await db.select().from(statuses).where(eq(statuses.id, id)).limit(1);
  if (!row) return "not_found" as const; if (row.userId !== userId) return "forbidden" as const;
  const recipientIds = await visibleRecipientIds(row);
  await db.delete(statuses).where(eq(statuses.id, id));
  if (row.mediaPath) await deleteStored(row.mediaPath);
  return { row, recipientIds };
}

export async function listStatusViewers(id: string, ownerId: string) {
  const [status] = await db.select().from(statuses).where(and(eq(statuses.id, id), eq(statuses.userId, ownerId), gt(statuses.expiresAt, new Date()))).limit(1);
  if (!status) return null;
  const rows = await db.select({ viewer: users, viewedAt: statusViews.viewedAt }).from(statusViews).innerJoin(users, eq(statusViews.viewerId, users.id)).where(eq(statusViews.statusId, id)).orderBy(desc(statusViews.viewedAt));
  return rows.map((r) => ({ viewer: toPublicUser(r.viewer), viewedAt: r.viewedAt.toISOString() }));
}

export async function reactToStatus(id: string, userId: string, emoji: string | null) {
  const row = await findVisibleStatus(id, userId); if (!row) return "not_found" as const;
  if (row.status.userId === userId) return "forbidden" as const;
  if (!emoji) {
    await db.delete(statusReactions).where(and(eq(statusReactions.statusId, id), eq(statusReactions.userId, userId)));
  } else {
    await db.insert(statusReactions).values({ statusId: id, userId, emoji }).onConflictDoUpdate({ target: [statusReactions.statusId, statusReactions.userId], set: { emoji, createdAt: new Date() } });
  }
  return row.status;
}
