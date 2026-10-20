import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMessageDTO } from "./chat";
import { publishToConversation } from "./realtime";

/** First recipient reveal establishes a single immutable server deadline. */
export async function revealSelfDestruct(messageId: string, userId: string) {
  const result = await db.execute<{ conversationId: string; expiresAt: Date; revealedAt: Date }>(sql`
    update messages m set revealed_at=coalesce(m.revealed_at,now()),
      expires_at=coalesce(m.expires_at,now()+interval '5 seconds')
    where m.id=${messageId} and m.self_destruct and m.sender_id<>${userId}
      and m.deleted_at is null and (m.expires_at is null or m.expires_at>now())
      and exists(select 1 from conversation_members mine join conversations c on c.id=mine.conversation_id
        where mine.conversation_id=m.conversation_id and mine.user_id=${userId} and c.deleted_at is null
          and (mine.cleared_at is null or m.created_at>mine.cleared_at)
          and (c.type<>'dm' or mine.accepted_at is not null))
      and not exists(select 1 from message_deletions d where d.message_id=m.id and d.user_id=${userId})
      and not exists(select 1 from blocks b where (b.blocker_id=${userId} and b.blocked_id=m.sender_id) or (b.blocked_id=${userId} and b.blocker_id=m.sender_id))
    returning m.conversation_id as "conversationId",m.expires_at as "expiresAt",m.revealed_at as "revealedAt"`);
  const row = result.rows[0]; if (!row) return null;
  await publishToConversation(row.conversationId, { type: "message:lifetime", conversationId: row.conversationId, messageId,
    serverNow: new Date().toISOString(), expiresAt: new Date(row.expiresAt).toISOString(), revealedAt: new Date(row.revealedAt).toISOString() });
  return getMessageDTO(messageId, userId);
}

/** Bounded cleanup independent of any user being online. Reads deny access at the deadline even before this sweep. */
export async function cleanupExpiredMessages() {
  return db.transaction(async tx => {
    const expired = await tx.execute<{ id: string; conversationId: string; expiresAt: Date }>(sql`
      with due as (select id from messages where expires_at<=now() and (deleted_at is null or text<>'')
        order by expires_at,id limit 200 for update skip locked)
      update messages m set text='',deleted_at=coalesce(m.deleted_at,m.expires_at),updated_at=now()
      from due where m.id=due.id returning m.id,m.conversation_id as "conversationId",m.expires_at as "expiresAt"`);
    const ids = expired.rows.map(row => row.id);
    if (!ids.length) return 0;
    const encoded = JSON.stringify(ids);
    await tx.execute(sql`delete from realtime_events where payload->'message'->>'id' in (select jsonb_array_elements_text(${encoded}::jsonb))`);
    await tx.execute(sql`update notifications set read_at=coalesce(read_at,now()),data=data-'preview'-'actorName'
      where data->>'messageId' in (select jsonb_array_elements_text(${encoded}::jsonb))`);
    const batch=JSON.stringify(expired.rows.map(row=>({...row,expiresAt:new Date(row.expiresAt).toISOString()})));
    await tx.execute(sql`insert into realtime_events(user_id,payload)
      select m.user_id,jsonb_build_object('type','message:lifetime','conversationId',e."conversationId"::text,'messageId',e.id::text,'expiresAt',e."expiresAt")
      from jsonb_to_recordset(${batch}::jsonb) as e(id uuid,"conversationId" uuid,"expiresAt" text)
      join conversation_members m on m.conversation_id=e."conversationId"`);
    return ids.length;
  });
}
