import { eq, and, sql, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { communities, communityMembers, channels, users, conversations, conversationMembers, realtimeEvents } from "@/db/schema";

async function withCounts<T extends {id:string}>(rows:T[]) {
  if (!rows.length) return [];
  const ids=rows.map(row=>row.id);
  const [members,groups]=await Promise.all([
    db.select({id:communityMembers.communityId,count:sql<number>`count(*)::int`}).from(communityMembers).where(inArray(communityMembers.communityId,ids)).groupBy(communityMembers.communityId),
    db.select({id:channels.communityId,count:sql<number>`count(*)::int`}).from(channels).where(inArray(channels.communityId,ids)).groupBy(channels.communityId),
  ]);
  const memberMap=new Map(members.map(row=>[row.id,row.count])),groupMap=new Map(groups.map(row=>[row.id,row.count]));
  return rows.map(row=>({...row,memberCount:memberMap.get(row.id)??0,channelCount:groupMap.get(row.id)??0}));
}

/** Create a new community */
export async function createCommunity(input: {
  name: string;
  description?: string;
  createdBy: string;
  isPublic?: boolean;
}) {
  return db.transaction(async tx=>{
    const [community]=await tx.insert(communities).values({name:input.name,description:input.description??null,createdBy:input.createdBy,isPublic:input.isPublic??true}).returning();
    await tx.insert(communityMembers).values({communityId:community.id,userId:input.createdBy,role:"owner"});
    return community;
  });
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

export async function getCommunityMembership(communityId: string, userId: string) {
  const [membership] = await db.select({ role: communityMembers.role }).from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId))).limit(1);
  return membership ?? null;
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
    .where(inArray(communities.id, communityIds));

  const communityMap = new Map(communityList.map((c) => [c.id, c]));

  return withCounts(memberships.map((m) => ({
    ...communityMap.get(m.communityId)!,
    myRole: m.role,
    joinedAt: m.joinedAt,
  })));
}

/** List public communities */
export const PUBLIC_COMMUNITIES_CACHE_TAG = "public-communities-v2";

// Only the public projection is shared. Memberships and authorization stay fresh.
// Arguments (including limit) form part of Next's cache key.
async function readPublicCommunities(limit: number) {
  return db
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
    .where(eq(communities.isPublic, true))
    .orderBy(sql`${communities.createdAt} DESC`)
    .limit(limit);
}

const cachedPublicCommunities = unstable_cache(async (limit: number) => ({
  rows: await readPublicCommunities(limit),
  expiresAt: Date.now() + 60_000,
}), [PUBLIC_COMMUNITIES_CACHE_TAG], {
  tags: [PUBLIC_COMMUNITIES_CACHE_TAG],
  revalidate: 60,
});

export async function listPublicCommunities(limit = 20) {
  const snapshot = await cachedPublicCommunities(limit);
  // Next can serve stale data while revalidating. Never return a directory
  // older than our TTL, even when an external SQL edit bypasses invalidation.
  const rows = Date.now() < snapshot.expiresAt ? snapshot.rows : await readPublicCommunities(limit);
  // Next serializes cached values; retain the existing server Date contract.
  return withCounts(rows.map(row => ({ ...row, createdAt: new Date(row.createdAt) })));
}

/** Join a community */
export async function joinCommunity(
  communityId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  return db.transaction(async tx=>{
    const [community]=await tx.select().from(communities).where(eq(communities.id,communityId)).for("update");
    if(!community)return {success:false,error:"Community not found."};
    const [existing]=await tx.select().from(communityMembers).where(and(eq(communityMembers.communityId,communityId),eq(communityMembers.userId,userId)));
    if(existing)return {success:true};if(!community.isPublic)return {success:false,error:"This community is private."};
    await tx.insert(communityMembers).values({communityId,userId,role:"member"});
    const linked=await tx.select().from(channels).where(eq(channels.communityId,communityId));
    for(const channel of linked){if(!channel.conversationId)continue;await tx.select({id:conversations.id}).from(conversations).where(eq(conversations.id,channel.conversationId)).for("update");await tx.insert(conversationMembers).values({conversationId:channel.conversationId,userId,role:"member",acceptedAt:new Date()}).onConflictDoNothing();const peers=await tx.select({id:conversationMembers.userId}).from(conversationMembers).where(eq(conversationMembers.conversationId,channel.conversationId));await tx.insert(realtimeEvents).values(peers.map(peer=>({userId:peer.id,payload:{type:"group:member-added" as const,conversationId:channel.conversationId!,userId}})));}
    await communityChanged(tx,communityId);return {success:true};
  });
}

type CommunityTx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function communityChanged(tx:CommunityTx,communityId:string,extra:string[]=[]) {
 const members=await tx.select({id:communityMembers.userId}).from(communityMembers).where(eq(communityMembers.communityId,communityId));const ids=[...new Set([...members.map(row=>row.id),...extra])];if(ids.length)await tx.insert(realtimeEvents).values(ids.map(userId=>({userId,payload:{type:"community:updated" as const,communityId}})));
}
export async function manageCommunity(communityId:string,actorId:string,input:{action:"edit"|"role"|"remove"|"leave"|"transfer";userId?:string;role?:"admin"|"member";name?:string;description?:string;isPublic?:boolean}) {
 return db.transaction(async tx=>{
  const [community]=await tx.select().from(communities).where(eq(communities.id,communityId)).for("update");if(!community)return false;
  const members=await tx.select().from(communityMembers).where(eq(communityMembers.communityId,communityId)).for("update");const actor=members.find(row=>row.userId===actorId);if(!actor)return false;
  if(input.action==="edit") {if(!["owner","admin"].includes(actor.role))return false;await tx.update(communities).set({...(input.name!==undefined?{name:input.name}:{}),...(input.description!==undefined?{description:input.description}:{}),...(input.isPublic!==undefined?{isPublic:input.isPublic}:{})}).where(eq(communities.id,communityId));await communityChanged(tx,communityId);return true;}
  const targetId=input.action==="leave"?actorId:input.userId;const target=members.find(row=>row.userId===targetId);if(!target||target.role==="owner")return false;
  if(input.action==="transfer") {
    if(actor.role!=="owner"||target.userId===actorId)return false;
    await tx.update(communities).set({createdBy:target.userId}).where(eq(communities.id,communityId));
    await tx.update(communityMembers).set({role:"admin"}).where(eq(communityMembers.id,actor.id));
    await tx.update(communityMembers).set({role:"owner"}).where(eq(communityMembers.id,target.id));
    const linked=await tx.select().from(channels).where(eq(channels.communityId,communityId)).orderBy(channels.conversationId);
    for(const channel of linked){if(!channel.conversationId)continue;await tx.update(conversations).set({createdById:target.userId,updatedAt:new Date()}).where(eq(conversations.id,channel.conversationId));await tx.update(conversationMembers).set({role:"admin"}).where(and(eq(conversationMembers.conversationId,channel.conversationId),eq(conversationMembers.role,"owner")));await tx.insert(conversationMembers).values({conversationId:channel.conversationId,userId:target.userId,role:"owner",acceptedAt:new Date()}).onConflictDoUpdate({target:[conversationMembers.conversationId,conversationMembers.userId],set:{role:"owner"}});const peers=await tx.select({id:conversationMembers.userId}).from(conversationMembers).where(eq(conversationMembers.conversationId,channel.conversationId));await tx.insert(realtimeEvents).values(peers.map(peer=>({userId:peer.id,payload:{type:"group:member-updated" as const,conversationId:channel.conversationId!,userId:target.userId,role:"owner" as const}})));}
    await communityChanged(tx,communityId);return true;
  }
  if(input.action==="role") {if(actor.role!=="owner"||!input.role)return false;await tx.update(communityMembers).set({role:input.role}).where(eq(communityMembers.id,target.id));}
  else {if(input.action!=="leave"&&(actorId===targetId||!["admin","owner"].includes(actor.role)||(actor.role==="admin"&&target.role!=="member")))return false;await tx.delete(communityMembers).where(eq(communityMembers.id,target.id));}
  const linked=await tx.select().from(channels).where(eq(channels.communityId,communityId)).orderBy(channels.conversationId);
  for(const channel of linked){if(!channel.conversationId)continue;await tx.select({id:conversations.id}).from(conversations).where(eq(conversations.id,channel.conversationId)).for("update");if(input.action==="role")await tx.update(conversationMembers).set({role:input.role}).where(and(eq(conversationMembers.conversationId,channel.conversationId),eq(conversationMembers.userId,target.userId)));else await tx.delete(conversationMembers).where(and(eq(conversationMembers.conversationId,channel.conversationId),eq(conversationMembers.userId,target.userId)));const peers=await tx.select({id:conversationMembers.userId}).from(conversationMembers).where(eq(conversationMembers.conversationId,channel.conversationId));const ids=[...new Set([...peers.map(row=>row.id),target.userId])];await tx.insert(realtimeEvents).values(ids.map(userId=>({userId,payload:{type:input.action==="role"?"group:member-updated" as const:"group:member-removed" as const,conversationId:channel.conversationId!,userId:target.userId}})));}
  await communityChanged(tx,communityId,[target.userId]);return true;
 });
}
export async function leaveCommunity(communityId:string,userId:string){return manageCommunity(communityId,userId,{action:"leave"});}

/** Create a channel in a community — also creates a conversation for chat */
export async function createChannel(input: {
  communityId: string;
  name: string;
  description?: string;
  type?: string;
  createdBy: string;
}) {
  return db.transaction(async tx => {
  await tx.select({id:communities.id}).from(communities).where(eq(communities.id,input.communityId)).for("update");
  const [actor] = await tx.select({ role: communityMembers.role }).from(communityMembers)
    .where(and(eq(communityMembers.communityId, input.communityId), eq(communityMembers.userId, input.createdBy))).limit(1).for("share");
  if (!actor) throw new Error("community_not_found");
  if (actor.role !== "owner" && actor.role !== "admin") throw new Error("community_channel_forbidden");
  const channelName = input.name.toLowerCase().replace(/\s+/g, "-");

  // 1. Create a conversation for this channel
  const [conversation] = await tx
    .insert(conversations)
    .values({
      type: "group",
      name: `${input.name}`,
      description: input.description ?? null,
      createdById: input.createdBy,
      adminOnlyMessaging: input.type === "announcement",
    })
    .returning();

  // 2. Get all community members and add them to the conversation
  const members = await tx
    .select({ userId: communityMembers.userId, role: communityMembers.role })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, input.communityId));

  if (members.length > 0) {
    await tx.insert(conversationMembers).values(
      members.map((m) => ({
        conversationId: conversation.id,
        userId: m.userId,
        role: m.role === "owner" ? "admin" : m.role === "admin" ? "admin" : "member",
        acceptedAt: new Date(),
      })),
    );
  }

  // 3. Create the channel linked to the conversation
  const [channel] = await tx
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

  await communityChanged(tx,input.communityId);
  return channel;
  });
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
