import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
export async function GET() {
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const result = await pool.query('SELECT verified_phone IS NOT NULL AS available, phone_discoverable AS enabled FROM users WHERE id=$1', [me.id]);
  return NextResponse.json(result.rows[0], { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: NextRequest) {
  const origin = guardSameOrigin(req); if (origin) return origin;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`phone-discovery:${me.id}`, 20, 60_000)).allowed) return jsonError(429, "Please try again shortly.");
  const body = await readJson(req); if (typeof body?.enabled !== "boolean") return jsonError(400, "Choose a discovery preference.");
  const result = await pool.query('UPDATE users SET phone_discoverable=$1 WHERE id=$2 AND (verified_phone IS NOT NULL OR $1=false) RETURNING id', [body.enabled, me.id]);
  if (!result.rowCount) return jsonError(409, "A verified phone sign-in is required first. You can still be found by name or username.");
  return NextResponse.json({ ok: true });
}
