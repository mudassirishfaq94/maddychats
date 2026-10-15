import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { isUuid } from "@/server/users";
import { isBlockedBetween } from "@/server/chat";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
export async function GET() {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  const rows = await pool.query(`SELECT u.id, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl", u.bio,
    u.created_at AS "createdAt", u.last_seen_at AS "lastSeenAt"
    FROM user_contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=$1
    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))
    ORDER BY u.display_name, u.id LIMIT 500`, [me.id]);
  return NextResponse.json({ users: rows.rows }, { headers: { "Cache-Control": "private, no-store" } });
}
async function change(req: NextRequest, remove: boolean) {
  const origin = guardSameOrigin(req); if (origin) return origin;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`contacts:${me.id}`, 60, 60_000)).allowed) return jsonError(429, "Please try again shortly.");
  const body = await readJson(req);
  if (typeof body?.userId !== "string" || !isUuid(body.userId) || body.userId === me.id) return jsonError(400, "Choose another person.");
  if (remove) await pool.query("DELETE FROM user_contacts WHERE owner_id=$1 AND contact_id=$2", [me.id, body.userId]);
  else {
    if (await isBlockedBetween(me.id, body.userId)) return jsonError(403, "This person cannot be added.");
    await pool.query("INSERT INTO user_contacts(owner_id, contact_id) SELECT $1,id FROM users WHERE id=$2 ON CONFLICT DO NOTHING", [me.id, body.userId]);
  }
  return NextResponse.json({ ok: true });
}
export const POST = (req: NextRequest) => change(req, false);
export const DELETE = (req: NextRequest) => change(req, true);
