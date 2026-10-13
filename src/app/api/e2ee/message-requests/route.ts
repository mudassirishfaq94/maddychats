import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";

/** Reconcile first introductions when an initiating trusted device reconnects. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const result = await db.execute<{ id: string }>(sql`
    select c.id from conversations c
    where c.type='dm' and c.created_by_id=${user.id} and c.deleted_at is null
      and exists(select 1 from messages m where m.conversation_id=c.id)
      and not exists(select 1 from messages m where m.conversation_id=c.id offset 1)
      and exists(select 1 from conversation_members p
        join e2ee_keys k on k.user_id=p.user_id and k.trusted_at is not null
        where p.conversation_id=c.id and p.user_id<>${user.id}
          and not exists(select 1 from e2ee_conversation_keys s
            where s.conversation_id=c.id and s.user_id=p.user_id and s.recipient_device_id=k.device_id))
    order by c.updated_at desc limit 100`);
  return NextResponse.json({ conversationIds: result.rows.map(row => row.id) }, { headers: { "Cache-Control": "no-store" } });
}
