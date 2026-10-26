import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";
import { decodeCursor, encodeCursor } from "@/server/chat";
import { isUuid } from "@/server/users";
export async function GET(request: NextRequest) {
  const me=await getSessionUser();if(!me)return jsonError(401,"Not authenticated.");
  const raw = request.nextUrl.searchParams.get("cursor");
  if (raw && raw.length > 256) return jsonError(400, "Invalid call-history cursor.");
  const cursor = decodeCursor(raw);
  if (raw && (!cursor || !isUuid(cursor.id))) return jsonError(400, "Invalid call-history cursor.");
  const result=await pool.query(`select n.id,n.created_at as "createdAt",n.data->>'conversationId' as "conversationId",n.data->>'direction' as direction,n.data->>'callOutcome' as outcome,
    u.display_name as name,n.created_at::text as "createdAtExact" from notifications n left join users u on u.id=n.actor_id where n.user_id=$1 and n.type='call'
    ${cursor ? "and (n.created_at,n.id)<($2::timestamptz,$3::uuid)" : ""} order by n.created_at desc,n.id desc limit 101`,cursor ? [me.id,cursor.createdAtExact ?? cursor.createdAt.toISOString(),cursor.id] : [me.id]);
  const page=result.rows.slice(0,100), last=page.at(-1);
  return NextResponse.json({calls:page.map(({createdAtExact:_exact,...row})=>row),nextCursor:result.rows.length>100 && last ? encodeCursor({id:last.id,createdAt:last.createdAt,createdAtExact:last.createdAtExact}) : null},{headers:{"Cache-Control":"private, no-store"}});
}
