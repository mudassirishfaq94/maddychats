import { and, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, messages, realtimeEvents } from "@/db/schema";

export async function acknowledgeDelivery(userId:string, messageIds:string[]) {
  if(!messageIds.length||messageIds.length>100)return [];
  return db.transaction(async tx=>{
    const deliveredAt=new Date();
    const updated=await tx.update(messages).set({deliveredAt}).where(and(inArray(messages.id,messageIds),ne(messages.senderId,userId),isNull(messages.deliveredAt),isNull(messages.deletedAt),or(isNull(messages.expiresAt),gt(messages.expiresAt,deliveredAt)),sql`exists(select 1 from conversation_members cm where cm.conversation_id=${messages.conversationId} and cm.user_id=${userId})`)).returning({id:messages.id,conversationId:messages.conversationId});
    const groups=new Map<string,string[]>();
    for(const row of updated)groups.set(row.conversationId,[...(groups.get(row.conversationId)??[]),row.id]);
    for(const [conversationId,ids] of groups){const recipients=await tx.select({id:conversationMembers.userId}).from(conversationMembers).where(eq(conversationMembers.conversationId,conversationId));if(recipients.length)await tx.insert(realtimeEvents).values(recipients.map(recipient=>({userId:recipient.id,payload:{type:"message:delivered" as const,conversationId,messageIds:ids,deliveredAt:deliveredAt.toISOString()}})));}
    return updated.map(row=>row.id);
  });
}
