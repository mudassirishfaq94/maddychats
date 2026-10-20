import { NextResponse } from "next/server";
import { pool } from "@/db";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";
export async function GET() {
  const me=await getSessionUser();if(!me)return jsonError(401,"Not authenticated.");
  const result=await pool.query(`select n.id,n.created_at as "createdAt",n.data->>'conversationId' as "conversationId",n.data->>'direction' as direction,n.data->>'callOutcome' as outcome,
    u.display_name as name from notifications n left join users u on u.id=n.actor_id where n.user_id=$1 and n.type='call' order by n.created_at desc,n.id desc limit 100`,[me.id]);
  return NextResponse.json({calls:result.rows},{headers:{"Cache-Control":"private, no-store"}});
}
