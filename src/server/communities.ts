import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { communities, communityMembers, channels, users, conversations, conversationMembers } from "@/db/schema";

/** Create a new community */
export async function createCommunity(input: {
  name: string;
  description?: string;
  createdBy: string;
  isPublic?: boolean;
}) {
  const [community] = await db
    .insert(communities)
    .values({
      name: input.name,
      description: input.description ?? null,
      createdBy: input.createdBy,
      isPublic: input.isPublic ?? true,
    })
    .returning();

  // Add creator as owner
  await db.insert(communityMembers).values({
    communityId: community.id,
    userId: input.createdBy,
    role: "owner",
  });

  return community;
}

/** Get a community by ID with member count */
export async function getCommunity(communityId: string) {
  const [community] = await db
    .select({
      id: communities.id,
      name: communities.name,
      description: communities.description,
      avatarUrl: communities.avatarUrl,
      createdBy: communities.createdBy,
      isPublic: communities.isPublic,
      createdAt: communities.createdAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!community) return null;

  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, communityId));

  const [{ channelCount }] = await db
    .select({ channelCount: sql<number>`count(*)::int` })
    .from(channels)
    .where(eq(channels.communityId, communityId));

  return { ...community, memberCount, channelCount };
}

/** List communities a user belongs to */
export async function listUserCommunities(userId: string) {
  const memberships = await db
    .select({
      communityId: communityMembers.communityId,
      role: communityMembers.role,
      joinedAt: communityMembers.joinedAt,
    })
    .from(communityMembers)
    .where(eq(communityMembers.userId, userId));

  if (memberships.length === 0) return [];

  const communityIds = memberships.map((m) => m.communityId);
  const communityList = await db
    .select()
    .from(communities)
    .where(sql`${communities.id} IN ${communityIds}`);

  const communityMap = new Map(communityList.map((c) => [c.id, c]));

  return memberships.map((m) => ({
    ...communityMap.get(m.communityId)!,
    myRole: m.role,
    joinedAt: m.joinedAt,
  }));
}

/** List public communities */
export async function listPublicCommunities(limit = 20) {
  return db
    .select({
      id: communities.id,
      name: communities.name,
      description: communities.description,
      avatarUrl: communities.avatarUrl,
      createdBy: communities.createdBy,
      createdAt: communities.createdAt,
    })
    .from(communities)
    .where(eq(communities.isPublic, true))
    .orderBy(sql`${communities.createdAt} DESC`)
    .limit(limit);
}

/** Join a community */
export async function joinCommunity(
  communityId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  // Check if already a member
  const [existing] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existing) return { success: true };

  // Check if community exists and is public
  const [community] = await db
    .select({ isPublic: communities.isPublic })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!community) return { success: false, error: "Community not found." };
  if (!community.isPublic) return { success: false, error: "This community is private." };

  await db.insert(communityMembers).values({
    communityId,
    userId,
    role: "member",
  });

  // Also add user to all existing channel conversations
  const communityChannels = await db
    .select({ conversationId: channels.conversationId })
    .from(channels)
    .where(eq(channels.communityId, communityId));

  for (const ch of communityChannels) {
    if (ch.conversationId) {
      await db
        .insert(conversationMembers)
        .values({
          conversationId: ch.conversationId,
          userId,
          role: "member",
          acceptedAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  return { success: true };
}

/** Leave a community */
export async function leaveCommunity(
  communityId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    )
    .returning();

  if (deleted.length > 0) {
    // Also remove from all channel conversations
    const communityChannels = await db
      .select({ conversationId: channels.conversationId })
      .from(channels)
      .where(eq(channels.communityId, communityId));

    for (const ch of communityChannels) {
      if (ch.conversationId) {
        await db
          .delete(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, ch.conversationId),
              eq(conversationMembers.userId, userId),
            ),
          );
      }
    }
  }

  return deleted.length > 0;
}

/** Create a channel in a community — also creates a conversation for chat */
export async function createChannel(input: {
  communityId: string;
  name: string;
  description?: string;
  type?: string;
  createdBy: string;
}) {
  const channelName = input.name.toLowerCase().replace(/\s+/g, "-");

  // 1. Create a conversation for this channel
  const [conversation] = await db
    .insert(conversations)
    .values({
      type: "group",
      name: `${input.name}`,
      description: input.description ?? null,
      createdById: input.createdBy,
    })
    .returning();

  // 2. Get all community members and add them to the conversation
  const members = await db
    .select({ userId: communityMembers.userId, role: communityMembers.role })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, input.communityId));

  if (members.length > 0) {
    await db.insert(conversationMembers).values(
      members.map((m) => ({
        conversationId: conversation.id,
        userId: m.userId,
        role: m.role === "owner" ? "admin" : m.role === "admin" ? "admin" : "member",
        acceptedAt: new Date(),
      })),
    );
  }

  // 3. Create the channel linked to the conversation
  const [channel] = await db
    .insert(channels)
    .values({
      communityId: input.communityId,
      name: channelName,
      description: input.description ?? null,
      type: input.type ?? "text",
      createdBy: input.createdBy,
      conversationId: conversation.id,
    })
    .returning();

  return channel;
}

/** List channels in a community */
export async function listChannels(communityId: string) {
  return db
    .select({
      id: channels.id,
      communityId: channels.communityId,
      name: channels.name,
      description: channels.description,
      type: channels.type,
      createdBy: channels.createdBy,
      conversationId: channels.conversationId,
      createdAt: channels.createdAt,
    })
    .from(channels)
    .where(eq(channels.communityId, communityId))
    .orderBy(sql`${channels.createdAt} ASC`);
}

/** Get community members */
export async function getCommunityMembers(communityId: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: communityMembers.role,
      joinedAt: communityMembers.joinedAt,
    })
    .from(communityMembers)
    .innerJoin(users, eq(communityMembers.userId, users.id))
    .where(eq(communityMembers.communityId, communityId))
    .orderBy(sql`CASE ${communityMembers.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`);
}
