import { randomBytes } from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { groupInviteLinks, users, conversationMembers } from "@/db/schema";

/** Generate a unique invite link code for a group */
export function generateInviteCode(): string {
  return randomBytes(8).toString("hex").slice(0, 12);
}

/** Create an invite link for a group */
export async function createGroupInviteLink(
  conversationId: string,
  createdByUserId: string,
  options?: { expiresInDays?: number; maxUses?: number },
) {
  const code = generateInviteCode();
  const expiresAt = options?.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 86_400_000)
    : null;

  const [link] = await db
    .insert(groupInviteLinks)
    .values({
      conversationId,
      code,
      createdByUserId,
      expiresAt,
      maxUses: options?.maxUses ?? null,
    })
    .returning();

  return link;
}

/** Get an invite link by code */
export async function getGroupInviteLink(code: string) {
  const [link] = await db
    .select()
    .from(groupInviteLinks)
    .where(eq(groupInviteLinks.code, code))
    .limit(1);

  if (!link) return null;

  // Check expiration
  if (link.expiresAt && link.expiresAt < new Date()) {
    return { ...link, expired: true };
  }

  // Check max uses
  if (link.maxUses && link.useCount >= link.maxUses) {
    return { ...link, exhausted: true };
  }

  return link;
}

/** Accept an invite link — add user to the group */
export async function acceptGroupInvite(
  code: string,
  userId: string,
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  const link = await getGroupInviteLink(code);

  if (!link) return { success: false, error: "Invalid invite link." };
  if ("expired" in link && link.expired) return { success: false, error: "This invite link has expired." };
  if ("exhausted" in link && link.exhausted) return { success: false, error: "This invite link has been used too many times." };

  if ("expired" in link || "exhausted" in link) return { success: false, error: "This invite link is no longer valid." };

  // Check if user is already a member
  const [existing] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, link.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    return { success: true, conversationId: link.conversationId };
  }

  // Add user to the group
  await db.insert(conversationMembers).values({
    conversationId: link.conversationId,
    userId,
    role: "member",
  });

  // Increment use count
  await db.execute(
    sql`UPDATE group_invite_links SET use_count = use_count + 1 WHERE code = ${code}`
  );

  return { success: true, conversationId: link.conversationId };
}

/** Revoke an invite link */
export async function revokeGroupInviteLink(
  linkId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(groupInviteLinks)
    .where(
      and(
        eq(groupInviteLinks.id, linkId),
        eq(groupInviteLinks.createdByUserId, userId),
      ),
    )
    .returning();

  return deleted.length > 0;
}

/** List invite links for a conversation */
export async function listGroupInviteLinks(conversationId: string) {
  return db
    .select({
      id: groupInviteLinks.id,
      code: groupInviteLinks.code,
      createdAt: groupInviteLinks.createdAt,
      expiresAt: groupInviteLinks.expiresAt,
      maxUses: groupInviteLinks.maxUses,
      useCount: groupInviteLinks.useCount,
      creator: {
        id: users.id,
        displayName: users.displayName,
      },
    })
    .from(groupInviteLinks)
    .innerJoin(users, eq(groupInviteLinks.createdByUserId, users.id))
    .where(eq(groupInviteLinks.conversationId, conversationId))
    .orderBy(sql`${groupInviteLinks.createdAt} DESC`);
}
