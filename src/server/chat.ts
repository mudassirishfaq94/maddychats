import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  blocks,
  conversationMembers,
  conversations,
  messageAttachments,
  messageDeletions,
  messageReactions,
  messageReads,
  messageStars,
  messages,
  messageMentions,
  pinnedMessages,
  users,
  type ConversationRow,
  type MessageRow,
  type UserRow,
} from "@/db/schema";
import { toPublicUser } from "./users";
import type {
  AttachmentDTO,
  ConversationDetail,
  ConversationSummary,
  MessageDTO,
  MessagePage,
  ReactionGroup,
  ReadReceipt,
  ReplyPreview,
  SearchHit,
} from "@/lib/types";

/** Page size for message history. */
export const MESSAGE_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

/* ------------------------------- membership ------------------------------- */

export async function getMembership(conversationId: string, userId: string) {
  const rows = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function memberIdsOf(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

/* ------------------------------ DTO hydration ----------------------------- */

function baseDTO(row: MessageRow, sender: UserRow): MessageDTO {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    text: deleted ? "" : row.text,
    type: row.type,
    senderId: row.senderId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    replyToMessageId: row.replyToMessageId,
    replyTo: null,
    reactions: [],
    readBy: [],
    attachments: [],
    sender: toPublicUser(sender),
    starred: false,
    deletedForMe: false,
    pinned: false,
  };
}

function groupReactions(
  rows: { messageId: string; userId: string; emoji: string }[],
  viewerId: string,
): Map<string, ReactionGroup[]> {
  const byMessage = new Map<string, Map<string, ReactionGroup>>();
  for (const r of rows) {
    let group = byMessage.get(r.messageId);
    if (!group) {
      group = new Map();
      byMessage.set(r.messageId, group);
    }
    const existing = group.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      mine: false,
      userIds: [] as string[],
    };
    existing.count += 1;
    existing.userIds.push(r.userId);
    if (r.userId === viewerId) existing.mine = true;
    group.set(r.emoji, existing);
  }
  const out = new Map<string, ReactionGroup[]>();
  for (const [messageId, group] of byMessage) {
    out.set(
      messageId,
      [...group.values()].sort(
        (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji),
      ),
    );
  }
  return out;
}

/**
 * Attaches reactions, read receipts and reply previews to a set of messages
 * in a fixed number of queries (no N+1).
 */
export async function hydrateMessages(
  rows: { message: MessageRow; sender: UserRow }[],
  viewerId: string,
): Promise<MessageDTO[]> {
  const dtos = rows.map((r) => baseDTO(r.message, r.sender));
  if (dtos.length === 0) return dtos;

  const ids = dtos.map((d) => d.id);

  const [reactionRows, readRows, attachmentRows] = await Promise.all([
    db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, ids)),
    db
      .select({
        messageId: messageReads.messageId,
        userId: messageReads.userId,
        readAt: messageReads.readAt,
      })
      .from(messageReads)
      .where(inArray(messageReads.messageId, ids)),
    db
      .select()
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, ids)),
  ]);

  // Reply previews (one extra query for referenced parents).
  const replyIds = [
    ...new Set(
      dtos
        .map((d) => d.replyToMessageId)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  const replyMap = new Map<string, ReplyPreview>();
  if (replyIds.length > 0) {
    const parents = await db
      .select({ message: messages, sender: users })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(inArray(messages.id, replyIds));
    for (const p of parents) {
      replyMap.set(p.message.id, {
        id: p.message.id,
        text: p.message.deletedAt ? "" : p.message.text,
        senderId: p.message.senderId,
        senderName: p.sender.displayName,
        deleted: p.message.deletedAt !== null,
      });
    }
  }

  const reactionsByMessage = groupReactions(reactionRows, viewerId);
  const readsByMessage = new Map<string, ReadReceipt[]>();
  for (const r of readRows) {
    const list = readsByMessage.get(r.messageId) ?? [];
    list.push({ userId: r.userId, readAt: r.readAt.toISOString() });
    readsByMessage.set(r.messageId, list);
  }

  const attachmentsByMessage = new Map<string, AttachmentDTO[]>();
  for (const a of attachmentRows) {
    const list = attachmentsByMessage.get(a.messageId) ?? [];
    list.push({
      id: a.id,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      kind:
        a.kind === "image" ? "image" : a.kind === "video" ? "video" : "file",
      url: `/api/media/${a.id}`,
    });
    attachmentsByMessage.set(a.messageId, list);
  }

  // Batch-fetch per-viewer star and deletion status, plus conversation-level pin status.
  const [starSet, deletionSet] = await Promise.all([
    getMyStars(ids, viewerId),
    getMyDeletions(ids, viewerId),
  ]);

  // Determine conversation ids for pin checks (messages in the batch may come from
  // different conversations when used in search, but the normal path is one conversation).
  const convIds = [...new Set(dtos.map((d) => d.conversationId))];
  const pinnedIdsPerConv = new Map<string, Set<string>>();
  for (const cid of convIds) {
    const pids = await getPinnedIds(ids, cid);
    pinnedIdsPerConv.set(cid, pids);
  }

  for (const dto of dtos) {
    dto.reactions = reactionsByMessage.get(dto.id) ?? [];
    // Only OTHER members' reads matter for the sender's receipt UI.
    dto.readBy = (readsByMessage.get(dto.id) ?? []).filter(
      (r) => r.userId !== dto.senderId,
    );
    dto.replyTo = dto.replyToMessageId
      ? replyMap.get(dto.replyToMessageId) ?? null
      : null;
    // Deleted messages never expose their attachments.
    dto.attachments = dto.deletedAt
      ? []
      : attachmentsByMessage.get(dto.id) ?? [];
    // Per-viewer per-message state.
    dto.starred = starSet.has(dto.id);
    dto.deletedForMe = deletionSet.has(dto.id);
    dto.pinned = pinnedIdsPerConv.get(dto.conversationId)?.has(dto.id) ?? false;
  }
  return dtos;
}

/** Loads a single message as a fully hydrated DTO. */
export async function getMessageDTO(
  messageId: string,
  viewerId: string,
): Promise<MessageDTO | null> {
  const rows = await db
    .select({ message: messages, sender: users })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!rows[0]) return null;
  const [dto] = await hydrateMessages(rows, viewerId);
  return dto ?? null;
}

/* ------------------------------ conversations ----------------------------- */

export function directKey(a: string, b: string): string {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export async function findDirectConversation(
  a: string,
  b: string,
): Promise<ConversationRow | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.dmKey, directKey(a, b)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listConversationsFor(
  userId: string,
): Promise<ConversationSummary[]> {
  const memberships = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  if (memberships.length === 0) return [];

  const convIds = memberships.map((m) => m.conversationId);
  const convs = await db
    .select()
    .from(conversations)
    .where(and(inArray(conversations.id, convIds), isNull(conversations.deletedAt)));
  if (convs.length === 0) return [];

  const allMembers = await db
    .select({ member: conversationMembers, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(inArray(conversationMembers.conversationId, convIds));

  const latest = await db.execute<{
    id: string;
    conversation_id: string;
    sender_id: string;
    text: string;
    type: string;
    created_at: string;
    deleted_at: string | null;
  }>(sql`
    SELECT DISTINCT ON (conversation_id)
      id, conversation_id, sender_id, text, type, created_at, deleted_at
    FROM messages
    WHERE conversation_id IN (${sql.join(
      convIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    ORDER BY conversation_id, created_at DESC
  `);
  const lastByConv = new Map(latest.rows.map((m) => [m.conversation_id, m]));

  // Unread counts: messages from others this user has not read.
  const unread = await db.execute<{ conversation_id: string; count: string }>(sql`
    SELECT m.conversation_id, count(*)::text AS count
    FROM messages m
    LEFT JOIN message_reads r
      ON r.message_id = m.id AND r.user_id = ${userId}
    WHERE m.conversation_id IN (${sql.join(
      convIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      AND m.sender_id <> ${userId}
      AND m.deleted_at IS NULL
      AND r.id IS NULL
    GROUP BY m.conversation_id
  `);
  const unreadByConv = new Map(
    unread.rows.map((r) => [r.conversation_id, Number(r.count)]),
  );

  // Pinned messages: check if any conversation has pinned messages.
  const pinnedConvs = await db
    .selectDistinct({ conversationId: pinnedMessages.conversationId })
    .from(pinnedMessages)
    .where(
      inArray(
        pinnedMessages.conversationId,
        convIds,
      ),
    );
  const hasPinned = new Set(pinnedConvs.map((r) => r.conversationId));

  // Blocking state for every counterpart in one query.
  const blockRows = await db.select().from(blocks);
  const isBlocked = (otherId: string) =>
    blockRows.some(
      (b) =>
        (b.blockerId === userId && b.blockedId === otherId) ||
        (b.blockerId === otherId && b.blockedId === userId),
    );

  const myMembership = new Map(memberships.map((m) => [m.conversationId, m]));

  return convs
    .map((conv) => {
      const others = allMembers.filter(
        (am) => am.member.conversationId === conv.id,
      );
      const other = others.find((am) => am.user.id !== userId)?.user ?? null;
      const last = lastByConv.get(conv.id);
      const mine = myMembership.get(conv.id);
      return {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        description: conv.description,
        avatarUrl: conv.avatarUrl,
        memberCount: others.length,
        requestPending: conv.type === "dm" && !mine?.acceptedAt,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
        lastMessageAt: conv.lastMessageAt
          ? conv.lastMessageAt.toISOString()
          : null,
        otherMember: other ? toPublicUser(other) : null,
        unreadCount: unreadByConv.get(conv.id) ?? 0,
        pinned: Boolean(mine?.pinnedAt),
        muted: Boolean(mine?.mutedAt),
        archived: Boolean(mine?.archivedAt),
        markedUnread: Boolean(mine?.markedUnreadAt),
        blocked: conv.type === "dm" && other ? isBlocked(other.id) : false,
        hasPinnedMessages: hasPinned.has(conv.id),
        lastMessage: last
          ? {
              id: last.id,
              text: last.deleted_at ? "" : last.text,
              type: last.type,
              senderId: last.sender_id,
              createdAt: new Date(last.created_at).toISOString(),
              deletedAt: last.deleted_at
                ? new Date(last.deleted_at).toISOString()
                : null,
            }
          : null,
      } satisfies ConversationSummary;
    })
    .sort((a, b) => {
      // Pinned conversations always float to the top.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const ta = a.lastMessageAt ?? a.createdAt;
      const tb = b.lastMessageAt ?? b.createdAt;
      return tb.localeCompare(ta);
    });
}

export async function getConversationForUser(
  conversationId: string,
  userId: string,
): Promise<ConversationDetail | null> {
  const membership = await getMembership(conversationId, userId);
  if (!membership) return null;

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conv = rows[0];
  if (!conv || conv.deletedAt) return null;

  const memberRows = await db
    .select({ user: users, member: conversationMembers })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(eq(conversationMembers.conversationId, conversationId));

  return {
    id: conv.id,
    type: conv.type,
    name: conv.name,
    description: conv.description,
    avatarUrl: conv.avatarUrl,
    createdById: conv.createdById,
    myRole: membership.role as "owner" | "admin" | "member",
    requestPending: conv.type === "dm" && !membership.acceptedAt,
    requestInitiatorId: conv.type === "dm" ? conv.createdById : null,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toISOString() : null,
    members: memberRows.map((m) => ({
      ...toPublicUser(m.user),
      role: m.member.role as "owner" | "admin" | "member",
      joinedAt: m.member.joinedAt.toISOString(),
    })),
  };
}

export async function createGroupConversation(input: {
  creatorId: string;
  name: string;
  description?: string;
  memberIds: string[];
}): Promise<ConversationRow> {
  const memberIds = [...new Set(input.memberIds)].filter((id) => id !== input.creatorId);
  if (memberIds.length === 0) throw new Error("group_requires_member");
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, memberIds));
  if (existing.length !== memberIds.length) throw new Error("invalid_group_members");

  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        type: "group",
        name: input.name.trim(),
        description: input.description?.trim() || null,
        createdById: input.creatorId,
      })
      .returning();
    await tx.insert(conversationMembers).values([
      { conversationId: conversation.id, userId: input.creatorId, role: "owner" },
      ...memberIds.map((userId) => ({ conversationId: conversation.id, userId, role: "member" })),
    ]);
    return conversation;
  });
}

export async function getGroupWithActor(conversationId: string, actorId: string) {
  const membership = await getMembership(conversationId, actorId);
  if (!membership) return null;
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation || conversation.type !== "group" || conversation.deletedAt) return null;
  return { conversation, membership };
}

export async function addGroupMember(conversationId: string, actorId: string, userId: string) {
  const ctx = await getGroupWithActor(conversationId, actorId);
  if (!ctx) return "not_found" as const;
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") return "forbidden" as const;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return "user_not_found" as const;
  try {
    await db.insert(conversationMembers).values({ conversationId, userId, role: "member" });
    return "ok" as const;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return "already_member" as const;
    throw error;
  }
}

export async function removeGroupMember(conversationId: string, actorId: string, userId: string) {
  const ctx = await getGroupWithActor(conversationId, actorId);
  if (!ctx) return "not_found" as const;
  if (actorId === userId) return "use_leave" as const;
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") return "forbidden" as const;
  const target = await getMembership(conversationId, userId);
  if (!target) return "member_not_found" as const;
  if (target.role === "owner") return "forbidden" as const;
  if (ctx.membership.role === "admin" && target.role !== "member") return "forbidden" as const;
  await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  return "ok" as const;
}

export async function changeGroupRole(conversationId: string, actorId: string, userId: string, role: "admin" | "member") {
  const ctx = await getGroupWithActor(conversationId, actorId);
  if (!ctx) return "not_found" as const;
  if (ctx.membership.role !== "owner") return "forbidden" as const;
  const target = await getMembership(conversationId, userId);
  if (!target) return "member_not_found" as const;
  if (target.role === "owner") return "forbidden" as const;
  await db.update(conversationMembers).set({ role }).where(eq(conversationMembers.id, target.id));
  return "ok" as const;
}

export async function transferGroupOwnership(conversationId: string, actorId: string, userId: string) {
  const ctx = await getGroupWithActor(conversationId, actorId);
  if (!ctx) return "not_found" as const;
  if (ctx.membership.role !== "owner") return "forbidden" as const;
  const target = await getMembership(conversationId, userId);
  if (!target || userId === actorId) return "member_not_found" as const;
  await db.transaction(async (tx) => {
    await tx.update(conversationMembers).set({ role: "admin" }).where(eq(conversationMembers.id, ctx.membership.id));
    await tx.update(conversationMembers).set({ role: "owner" }).where(eq(conversationMembers.id, target.id));
    await tx.update(conversations).set({ createdById: userId, updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  });
  return "ok" as const;
}

export async function leaveGroup(conversationId: string, userId: string) {
  const ctx = await getGroupWithActor(conversationId, userId);
  if (!ctx) return "not_found" as const;
  if (ctx.membership.role === "owner") return "owner_must_transfer" as const;
  await db.delete(conversationMembers).where(eq(conversationMembers.id, ctx.membership.id));
  return "ok" as const;
}

export async function deleteGroup(conversationId: string, userId: string) {
  const ctx = await getGroupWithActor(conversationId, userId);
  if (!ctx) return "not_found" as const;
  if (ctx.membership.role !== "owner") return "forbidden" as const;
  await db.update(conversations).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  return "ok" as const;
}

export async function storeMessageMentions(messageId: string, conversationId: string, text: string, actorId: string) {
  const usernames = [...new Set([...text.matchAll(/(^|\s)@([a-zA-Z0-9_]{3,20})\b/g)].map((m) => m[2].toLowerCase()))];
  if (usernames.length === 0) return [];
  const rows = await db.select({ id: users.id, username: users.username }).from(users)
    .innerJoin(conversationMembers, and(eq(conversationMembers.userId, users.id), eq(conversationMembers.conversationId, conversationId)))
    .where(sql`lower(${users.username}) in (${sql.join(usernames.map((name) => sql`${name}`), sql`, `)})`);
  const mentioned = rows.filter((row) => row.id !== actorId);
  if (mentioned.length) await db.insert(messageMentions).values(mentioned.map((row) => ({ messageId, userId: row.id }))).onConflictDoNothing();
  return mentioned;
}

export async function createDirectConversation(
  me: string,
  other: string,
): Promise<{ conversation: ConversationRow; created: boolean }> {
  const existing = await findDirectConversation(me, other);
  if (existing) return { conversation: existing, created: false };

  try {
    const conv = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(conversations)
        .values({ type: "dm", dmKey: directKey(me, other), createdById: me })
        .returning();
      await tx.insert(conversationMembers).values([
        { conversationId: inserted[0].id, userId: me, role: "owner", acceptedAt: new Date() },
        { conversationId: inserted[0].id, userId: other, role: "member", acceptedAt: null },
      ]);
      return inserted[0];
    });
    return { conversation: conv, created: true };
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      const winner = await findDirectConversation(me, other);
      if (winner) return { conversation: winner, created: false };
    }
    throw err;
  }
}

export async function acceptDirectConversation(conversationId: string, userId: string) {
  const membership = await getMembership(conversationId, userId);
  if (!membership) return "not_found" as const;
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation || conversation.type !== "dm" || conversation.deletedAt) return "not_found" as const;
  if (conversation.createdById === userId) return "already_accepted" as const;
  if (membership.acceptedAt) return "already_accepted" as const;
  await db.update(conversationMembers).set({ acceptedAt: new Date() }).where(eq(conversationMembers.id, membership.id));
  return "ok" as const;
}

export async function deleteConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const membership = await getMembership(conversationId, userId);
  if (!membership) return false;
  await db.delete(conversations).where(eq(conversations.id, conversationId));
  return true;
}

/* --------------------------------- messages -------------------------------- */

interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return `${c.createdAt.toISOString()}|${c.id}`;
}

export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf("|");
  if (idx <= 0) return null;
  const ts = new Date(raw.slice(0, idx));
  const id = raw.slice(idx + 1);
  if (Number.isNaN(ts.getTime()) || !id) return null;
  return { createdAt: ts, id };
}

export async function listMessages(
  conversationId: string,
  cursor: Cursor | null,
  limit = MESSAGE_PAGE_SIZE,
  viewerId = "",
): Promise<MessagePage> {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);

  const where = cursor
    ? and(
        eq(messages.conversationId, conversationId),
        or(
          lt(messages.createdAt, cursor.createdAt),
          and(
            eq(messages.createdAt, cursor.createdAt),
            lt(messages.id, cursor.id),
          ),
        ),
      )
    : eq(messages.conversationId, conversationId);

  const rows = await db
    .select({ message: messages, sender: users })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(where)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize);
  const oldest = page[page.length - 1];
  const chronological = page.slice().reverse();

  return {
    messages: await hydrateMessages(chronological, viewerId),
    nextCursor:
      hasMore && oldest
        ? encodeCursor({
            createdAt: oldest.message.createdAt,
            id: oldest.message.id,
          })
        : null,
    hasMore,
  };
}

export async function createMessage(
  conversationId: string,
  senderId: string,
  text: string,
  replyToMessageId?: string | null,
): Promise<MessageDTO> {
  // A reply target must belong to the same conversation.
  let replyId: string | null = null;
  if (replyToMessageId) {
    const parent = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.id, replyToMessageId),
          eq(messages.conversationId, conversationId),
        ),
      )
      .limit(1);
    replyId = parent[0]?.id ?? null;
  }

  const inserted = await db.transaction(async (tx) => {
    const now = new Date();
    const rows = await tx
      .insert(messages)
      .values({
        conversationId,
        senderId,
        text,
        type: "text",
        replyToMessageId: replyId,
      })
      .returning();
    await tx
      .update(conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(conversations.id, conversationId));
    return rows[0];
  });

  return (await getMessageDTO(inserted.id, senderId))!;
}

export async function editMessage(
  messageId: string,
  userId: string,
  text: string,
): Promise<MessageRow | "not_found" | "forbidden" | "deleted"> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  const msg = rows[0];
  if (!msg) return "not_found";
  if (msg.senderId !== userId) return "forbidden";
  if (msg.deletedAt) return "deleted";

  const now = new Date();
  const updated = await db
    .update(messages)
    .set({ text, editedAt: now, updatedAt: now })
    .where(eq(messages.id, messageId))
    .returning();
  return updated[0];
}

export async function softDeleteMessage(
  messageId: string,
  userId: string,
): Promise<MessageRow | "not_found" | "forbidden"> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  const msg = rows[0];
  if (!msg) return "not_found";
  if (msg.senderId !== userId) return "forbidden";
  if (msg.deletedAt) return msg;

  const now = new Date();
  const updated = await db
    .update(messages)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(messages.id, messageId))
    .returning();
  return updated[0];
}

/* ------------------------------ read receipts ------------------------------ */

/**
 * Marks every unread message from OTHER members as read for this user.
 * Returns the affected message ids (empty when already up to date).
 */
export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<{ messageIds: string[]; readAt: Date }> {
  const readAt = new Date();
  const unread = await db
    .select({ id: messages.id })
    .from(messages)
    .leftJoin(
      messageReads,
      and(
        eq(messageReads.messageId, messages.id),
        eq(messageReads.userId, userId),
      ),
    )
    .where(
      and(
        eq(messages.conversationId, conversationId),
        ne(messages.senderId, userId),
        isNull(messages.deletedAt),
        isNull(messageReads.id),
      ),
    );

  const ids = unread.map((r) => r.id);
  if (ids.length === 0) return { messageIds: [], readAt };

  await db
    .insert(messageReads)
    .values(ids.map((messageId) => ({ messageId, userId, readAt })))
    .onConflictDoNothing();

  return { messageIds: ids, readAt };
}

/**
 * Marks messages addressed to `userId` as delivered (called when they come
 * online). Returns affected ids grouped by conversation.
 */
export async function markDeliveredFor(
  userId: string,
): Promise<Map<string, string[]>> {
  const deliveredAt = new Date();
  const rows = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .where(and(ne(messages.senderId, userId), isNull(messages.deliveredAt)));

  if (rows.length === 0) return new Map();

  await db
    .update(messages)
    .set({ deliveredAt })
    .where(
      inArray(
        messages.id,
        rows.map((r) => r.id),
      ),
    );

  const byConv = new Map<string, string[]>();
  for (const r of rows) {
    const list = byConv.get(r.conversationId) ?? [];
    list.push(r.id);
    byConv.set(r.conversationId, list);
  }
  return byConv;
}

/** Stamps a single message as delivered (recipient already online). */
export async function markMessageDelivered(messageId: string): Promise<Date> {
  const deliveredAt = new Date();
  await db
    .update(messages)
    .set({ deliveredAt })
    .where(and(eq(messages.id, messageId), isNull(messages.deliveredAt)));
  return deliveredAt;
}

/* -------------------------------- reactions -------------------------------- */

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await db
    .insert(messageReactions)
    .values({ messageId, userId, emoji })
    .onConflictDoNothing();
}

export async function removeReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    );
}

/** Conversation id for a message (membership checks). */
export async function conversationIdOfMessage(
  messageId: string,
): Promise<string | null> {
  const rows = await db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  return rows[0]?.conversationId ?? null;
}

/* --------------------------------- blocking -------------------------------- */

/** True when either user has blocked the other (symmetric enforcement). */
export async function isBlockedBetween(
  a: string,
  b: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await db
    .insert(blocks)
    .values({ blockerId, blockedId })
    .onConflictDoNothing();
}

export async function unblockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await db
    .delete(blocks)
    .where(
      and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)),
    );
}

/** Users the viewer has blocked (for profile/UI state). */
export async function listBlockedIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ blockedId: blocks.blockedId })
    .from(blocks)
    .where(eq(blocks.blockerId, userId));
  return rows.map((r) => r.blockedId);
}

/* ------------------------ per-user conversation state ---------------------- */

export type ConversationControl =
  | "pin"
  | "unpin"
  | "mute"
  | "unmute"
  | "archive"
  | "unarchive"
  | "markUnread"
  | "markRead";

export async function applyConversationControl(
  conversationId: string,
  userId: string,
  action: ConversationControl,
): Promise<boolean> {
  const membership = await getMembership(conversationId, userId);
  if (!membership) return false;

  const now = new Date();
  const patch: Partial<typeof conversationMembers.$inferInsert> = {};
  switch (action) {
    case "pin":
      patch.pinnedAt = now;
      break;
    case "unpin":
      patch.pinnedAt = null;
      break;
    case "mute":
      patch.mutedAt = now;
      break;
    case "unmute":
      patch.mutedAt = null;
      break;
    case "archive":
      patch.archivedAt = now;
      break;
    case "unarchive":
      patch.archivedAt = null;
      break;
    case "markUnread":
      patch.markedUnreadAt = now;
      break;
    case "markRead":
      patch.markedUnreadAt = null;
      break;
  }

  await db
    .update(conversationMembers)
    .set(patch)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );
  return true;
}

/**
 * "Delete for me" on a 1:1 chat: hides existing history for this user only
 * and archives it. The row — and the other participant's copy — survive.
 * Only when EVERY member has cleared it is the conversation really removed.
 */
export async function clearConversationForUser(
  conversationId: string,
  userId: string,
): Promise<"cleared" | "removed" | null> {
  const membership = await getMembership(conversationId, userId);
  if (!membership) return null;

  const now = new Date();
  await db
    .update(conversationMembers)
    .set({ clearedAt: now, archivedAt: now, markedUnreadAt: null })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    );

  const remaining = await db
    .select({ clearedAt: conversationMembers.clearedAt })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));

  if (remaining.length > 0 && remaining.every((m) => m.clearedAt !== null)) {
    await db.delete(conversations).where(eq(conversations.id, conversationId));
    return "removed";
  }
  return "cleared";
}

/** The viewer's `clearedAt` watermark for a conversation, if any. */
export async function clearedAtFor(
  conversationId: string,
  userId: string,
): Promise<Date | null> {
  const membership = await getMembership(conversationId, userId);
  return membership?.clearedAt ?? null;
}

/* ------------------------------ message search ----------------------------- */

/**
 * Full-text-ish search across every conversation the user belongs to.
 * Authorization is enforced by the membership join — results can never
 * include messages from conversations the user is not part of, and content
 * hidden by their `clearedAt` watermark is excluded.
 */
export async function searchMessages(
  userId: string,
  query: string,
  limit = 25,
): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await db
    .select({
      message: messages,
      sender: users,
      conversation: conversations,
      clearedAt: conversationMembers.clearedAt,
    })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .innerJoin(users, eq(users.id, messages.senderId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        isNull(messages.deletedAt),
        sql`${messages.text} ILIKE ${`%${q}%`}`,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(Math.min(Math.max(1, limit), 50));

  return rows
    .filter(
      (r) => !r.clearedAt || r.message.createdAt > r.clearedAt,
    )
    .map((r) => ({
      message: {
        id: r.message.id,
        text: r.message.text,
        createdAt: r.message.createdAt.toISOString(),
        conversationId: r.message.conversationId,
      },
      conversation: { id: r.conversation.id, name: r.conversation.name },
      sender: toPublicUser(r.sender),
    }));
}

/* =================================== stars ================================= */

export async function starMessage(
  messageId: string,
  userId: string,
): Promise<"ok" | "not_found" | "already_starred" | "no_membership"> {
  const msgRows = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!msgRows[0]) return "not_found";

  const membership = await getMembership(msgRows[0].conversationId, userId);
  if (!membership) return "no_membership";

  try {
    await db.insert(messageStars).values({ messageId, userId });
    return "ok";
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") return "already_starred";
    throw err;
  }
}

export async function unstarMessage(
  messageId: string,
  userId: string,
): Promise<"ok" | "not_found" | "not_starred"> {
  const deleted = await db
    .delete(messageStars)
    .where(
      and(
        eq(messageStars.messageId, messageId),
        eq(messageStars.userId, userId),
      ),
    )
    .returning();
  return deleted.length > 0 ? "ok" : "not_starred";
}

/** Check if a user has starred a specific message. */
export async function isStarred(
  messageId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: messageStars.id })
    .from(messageStars)
    .where(
      and(
        eq(messageStars.messageId, messageId),
        eq(messageStars.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** All messages a user has starred, newest first. */
export async function listStarredMessages(
  userId: string,
): Promise<StarredMessageDTO[]> {
  const rows = await db
    .select({
      star: messageStars,
      message: messages,
      sender: users,
      conversation: conversations,
    })
    .from(messageStars)
    .innerJoin(messages, eq(messageStars.messageId, messages.id))
    .innerJoin(users, eq(messages.senderId, users.id))
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(messageStars.userId, userId))
    .orderBy(desc(messageStars.createdAt));

  if (rows.length === 0) return [];

  // Fetch attachments for all messages in one batch.
  const msgIds = rows.map((r) => r.message.id);
  const attachmentRows = await db
    .select()
    .from(messageAttachments)
    .where(inArray(messageAttachments.messageId, msgIds));
  const attachmentsByMsg = new Map<string, AttachmentDTO[]>();
  for (const a of attachmentRows) {
    if (a.messageId) {
      const list = attachmentsByMsg.get(a.messageId) ?? [];
      list.push({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        kind:
          a.kind === "image" ? "image" : a.kind === "video" ? "video" : "file",
        url: `/api/media/${a.id}`,
      });
      attachmentsByMsg.set(a.messageId, list);
    }
  }

  return rows.map((r) => ({
    id: r.star.id,
    messageId: r.message.id,
    text: r.message.deletedAt ? "" : r.message.text,
    type: r.message.type,
    createdAt: r.star.createdAt.toISOString(),
    starredAt: r.star.createdAt.toISOString(),
    deletedAt: r.message.deletedAt
      ? r.message.deletedAt.toISOString()
      : null,
    sender: toPublicUser(r.sender),
    conversation: {
      id: r.conversation.id,
      name: r.conversation.name,
    },
    attachments: r.message.deletedAt
      ? []
      : attachmentsByMsg.get(r.message.id) ?? [],
  }));
}

export interface StarredMessageDTO {
  id: string;
  messageId: string;
  text: string;
  type: string;
  createdAt: string;
  starredAt: string;
  deletedAt: string | null;
  sender: ReturnType<typeof toPublicUser>;
  conversation: { id: string; name: string | null };
  attachments: AttachmentDTO[];
}

/* =================================== pins ================================= */

/** Check whether the viewer can pin/unpin in this conversation. */
export async function canPin(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const membership = await getMembership(conversationId, userId);
  if (!membership) return false;
  // DM: any participant. Group: owner or admin.
  const convRows = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!convRows[0]) return false;
  if (convRows[0].type === "dm") return true;
  return membership.role === "owner" || membership.role === "admin";
}

export async function pinMessage(
  conversationId: string,
  messageId: string,
  userId: string,
): Promise<"ok" | "not_found" | "already_pinned" | "forbidden"> {
  // Verify message belongs to conversation.
  const msgRows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .limit(1);
  if (!msgRows[0]) return "not_found";

  if (!(await canPin(conversationId, userId))) return "forbidden";

  try {
    await db
      .insert(pinnedMessages)
      .values({ conversationId, messageId, pinnedBy: userId });
    return "ok";
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") return "already_pinned";
    throw err;
  }
}

export async function unpinMessage(
  conversationId: string,
  messageId: string,
  userId: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  if (!(await canPin(conversationId, userId))) return "forbidden";
  const deleted = await db
    .delete(pinnedMessages)
    .where(
      and(
        eq(pinnedMessages.conversationId, conversationId),
        eq(pinnedMessages.messageId, messageId),
      ),
    )
    .returning();
  return deleted.length > 0 ? "ok" : "not_found";
}

/** Check if a message is pinned in a conversation. */
export async function isPinned(
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: pinnedMessages.id })
    .from(pinnedMessages)
    .where(
      and(
        eq(pinnedMessages.conversationId, conversationId),
        eq(pinnedMessages.messageId, messageId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Whether the conversation has any pinned messages. */
export async function hasPinnedMessages(
  conversationId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: pinnedMessages.id })
    .from(pinnedMessages)
    .where(eq(pinnedMessages.conversationId, conversationId))
    .limit(1);
  return rows.length > 0;
}

/** All pinned messages for a conversation. */
export async function listPinnedMessages(
  conversationId: string,
  viewerId: string,
): Promise<PinnedMessageDTO[]> {
  const rows = await db
    .select({
      pin: pinnedMessages,
      message: messages,
      sender: users,
    })
    .from(pinnedMessages)
    .innerJoin(messages, eq(pinnedMessages.messageId, messages.id))
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(pinnedMessages.conversationId, conversationId))
    .orderBy(desc(pinnedMessages.createdAt));
  return rows.map((r) => ({
    id: r.pin.id,
    messageId: r.message.id,
    conversationId,
    text: r.message.deletedAt ? "" : r.message.text,
    type: r.message.type,
    pinnedAt: r.pin.createdAt.toISOString(),
    pinnedBy: r.pin.pinnedBy,
    deletedAt: r.message.deletedAt
      ? r.message.deletedAt.toISOString()
      : null,
    sender: toPublicUser(r.sender),
  }));
}

export interface PinnedMessageDTO {
  id: string;
  messageId: string;
  conversationId: string;
  text: string;
  type: string;
  pinnedAt: string;
  pinnedBy: string;
  deletedAt: string | null;
  sender: ReturnType<typeof toPublicUser>;
}

/* ================================ deletion ================================ */

/**
 * "Delete for me" — hides message for the specified user only.
 * Creates a per-user deletion record; the message stays visible to others.
 */
export async function deleteForMe(
  messageId: string,
  userId: string,
): Promise<"ok" | "not_found" | "already_deleted"> {
  const msgRows = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!msgRows[0]) return "not_found";

  const membership = await getMembership(msgRows[0].conversationId, userId);
  if (!membership) return "not_found";

  try {
    await db.insert(messageDeletions).values({ messageId, userId });
    return "ok";
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") return "already_deleted";
    throw err;
  }
}

/** Check if a user has soft-deleted a specific message for themselves. */
export async function isDeletedForMe(
  messageId: string,
  userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: messageDeletions.id })
    .from(messageDeletions)
    .where(
      and(
        eq(messageDeletions.messageId, messageId),
        eq(messageDeletions.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * "Delete for everyone" — soft-deletes the message for all conversation
 * members. Only the message sender can do this.
 *
 * Sets the global `deletedAt` on the message row, which hides content
 * from all members and prevents attachment access.
 */
export async function deleteForEveryone(
  messageId: string,
  userId: string,
): Promise<MessageRow | "not_found" | "forbidden" | "already_deleted"> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  const msg = rows[0];
  if (!msg) return "not_found";
  if (msg.senderId !== userId) return "forbidden";
  if (msg.deletedAt) return "already_deleted";

  const now = new Date();
  const updated = await db
    .update(messages)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(messages.id, messageId))
    .returning();
  return updated[0];
}

/** Which messages in a list the viewer has deleted for themselves. */
export async function getMyDeletions(
  messageIds: string[],
  userId: string,
): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const rows = await db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .where(
      and(
        inArray(messageDeletions.messageId, messageIds),
        eq(messageDeletions.userId, userId),
      ),
    );
  return new Set(rows.map((r) => r.messageId));
}

/** Which messages in a list are starred by the viewer. */
export async function getMyStars(
  messageIds: string[],
  userId: string,
): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const rows = await db
    .select({ messageId: messageStars.messageId })
    .from(messageStars)
    .where(
      and(
        inArray(messageStars.messageId, messageIds),
        eq(messageStars.userId, userId),
      ),
    );
  return new Set(rows.map((r) => r.messageId));
}

/** Which messages in a list are pinned in the given conversation. */
export async function getPinnedIds(
  messageIds: string[],
  conversationId: string,
): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const rows = await db
    .select({ messageId: pinnedMessages.messageId })
    .from(pinnedMessages)
    .where(
      and(
        inArray(pinnedMessages.messageId, messageIds),
        eq(pinnedMessages.conversationId, conversationId),
      ),
    );
  return new Set(rows.map((r) => r.messageId));
}

/* ============================= media gallery ============================== */

/** Shared link detected in message text. */
export interface SharedLinkItem {
  messageId: string;
  url: string;
  text: string;
  createdAt: string;
  sender: ReturnType<typeof toPublicUser>;
}

/**
 * List image/video attachments for a conversation.
 * Excludes deleted-for-everyone messages and deleted-for-me messages.
 */
export async function listConversationMedia(
  conversationId: string,
  viewerId: string,
): Promise<AttachmentDTO[]> {
  // Get messages deleted for this viewer.
  const myDelRows = await db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .innerJoin(messages, eq(messages.id, messageDeletions.messageId))
    .where(
      and(
        eq(messageDeletions.userId, viewerId),
        eq(messages.conversationId, conversationId),
      ),
    );
  const myDeletedIds = new Set(myDelRows.map((r) => r.messageId));

  const rows = await db
    .select({
      attachment: messageAttachments,
      message: messages,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        inArray(messageAttachments.kind, ["image", "video"]),
      ),
    )
    .orderBy(desc(messages.createdAt));

  return rows
    .filter((r) => !myDeletedIds.has(r.message.id))
    .map((r) => ({
      id: r.attachment.id,
      originalName: r.attachment.originalName,
      mimeType: r.attachment.mimeType,
      size: r.attachment.size,
      kind: (r.attachment.kind === "video" ? "video" : "image") as
        | "image"
        | "video",
      url: `/api/media/${r.attachment.id}`,
    }));
}

/**
 * List file (non-image) attachments for a conversation.
 * Excludes deleted-for-everyone and deleted-for-me messages.
 */
export async function listConversationFiles(
  conversationId: string,
  viewerId: string,
): Promise<(AttachmentDTO & { createdAt: string })[]> {
  const myDelRows = await db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .innerJoin(messages, eq(messages.id, messageDeletions.messageId))
    .where(
      and(
        eq(messageDeletions.userId, viewerId),
        eq(messages.conversationId, conversationId),
      ),
    );
  const myDeletedIds = new Set(myDelRows.map((r) => r.messageId));

  const rows = await db
    .select({
      attachment: messageAttachments,
      message: messages,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        eq(messageAttachments.kind, "file"),
      ),
    )
    .orderBy(desc(messages.createdAt));

  return rows
    .filter((r) => !myDeletedIds.has(r.message.id))
    .map((r) => ({
      id: r.attachment.id,
      originalName: r.attachment.originalName,
      mimeType: r.attachment.mimeType,
      size: r.attachment.size,
      kind: "file" as const,
      url: `/api/media/${r.attachment.id}`,
      createdAt: r.message.createdAt.toISOString(),
    }));
}

/**
 * Extract shared links from message text in a conversation.
 * Only non-deleted messages are scanned.
 */
export async function listConversationLinks(
  conversationId: string,
  viewerId: string,
): Promise<SharedLinkItem[]> {
  const myDelRows = await db
    .select({ messageId: messageDeletions.messageId })
    .from(messageDeletions)
    .innerJoin(messages, eq(messages.id, messageDeletions.messageId))
    .where(
      and(
        eq(messageDeletions.userId, viewerId),
        eq(messages.conversationId, conversationId),
      ),
    );
  const myDeletedIds = new Set(myDelRows.map((r) => r.messageId));

  const rows = await db
    .select({ message: messages, sender: users })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        sql`${messages.text} ~* ${'https?://[^\s]+'}`,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(200);

  const urlRegex = /https?:\/\/[^\s]+/gi;
  const results: SharedLinkItem[] = [];

  for (const row of rows) {
    if (myDeletedIds.has(row.message.id)) continue;
    const text = row.message.text;
    const matches = text.match(urlRegex);
    if (!matches) continue;
    for (const url of matches) {
      results.push({
        messageId: row.message.id,
        url,
        text: text.slice(0, 100),
        createdAt: row.message.createdAt.toISOString(),
        sender: toPublicUser(row.sender),
      });
    }
    if (results.length >= 100) break;
  }

  return results;
}
