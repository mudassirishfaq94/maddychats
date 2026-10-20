import { lockGroupActor } from "./chat";
import { randomBytes } from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { groupInviteLinks, users, conversationMembers, conversations } from "@/db/schema";

/** Generate a unique invite link code for a group */
export function generateInviteCode(): string {
  return randomBytes(16).toString("hex");
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

  return db.transaction(async tx=>{
    const context=await lockGroupActor(tx,conversationId,createdByUserId);
    if(!context || !["owner","admin"].includes(context.membership.role))throw new Error("Only group admins can create invite links.");
  const [link] = await tx
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
  });
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
  return db.transaction(async tx => {
    // Every membership/invite mutation takes the group lock before a link lock.
    const [hint]=await tx.select({conversationId:groupInviteLinks.conversationId}).from(groupInviteLinks).where(eq(groupInviteLinks.code,code)).limit(1);
    if(!hint)return {success:false,error:"Invalid invite link."};
    const [group]=await tx.select({type:conversations.type,deletedAt:conversations.deletedAt}).from(conversations).where(eq(conversations.id,hint.conversationId)).for("update");
    if(!group || group.type!=="group" || group.deletedAt)return {success:false,error:"This group is no longer available."};
    const [link]=await tx.select().from(groupInviteLinks).where(eq(groupInviteLinks.code,code)).for("update").limit(1);
    if(!link)return {success:false,error:"Invalid invite link."};
    const [existing] = await tx.select({ id: conversationMembers.id }).from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, link.conversationId), eq(conversationMembers.userId, userId))).limit(1);
    if (existing) return { success: true, conversationId: link.conversationId };
    if (link.expiresAt && link.expiresAt <= new Date()) return { success: false, error: "This invite link has expired." };
    if (link.maxUses !== null && link.useCount >= link.maxUses) return { success: false, error: "This invite link has been used too many times." };
    const added = await tx.insert(conversationMembers).values({ conversationId: link.conversationId, userId, role: "member", acceptedAt: new Date() })
      .onConflictDoNothing().returning({ id: conversationMembers.id });
    if (added.length) await tx.update(groupInviteLinks).set({ useCount: sql`${groupInviteLinks.useCount} + 1` }).where(eq(groupInviteLinks.id, link.id));
    return { success: true, conversationId: link.conversationId };
  });
}

/** Revoke an invite link */
export async function revokeGroupInviteLink(
  linkId: string,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  return db.transaction(async tx=>{
    const context=await lockGroupActor(tx,conversationId,userId);
    if(!context || !["owner","admin"].includes(context.membership.role))return false;
  const deleted = await tx
    .delete(groupInviteLinks)
    .where(
      and(
        eq(groupInviteLinks.id, linkId),
        eq(groupInviteLinks.conversationId, conversationId),
      ),
    )
    .returning();

  return deleted.length > 0;
  });
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
