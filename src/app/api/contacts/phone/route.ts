import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
export async function GET() {
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const result = await pool.query('SELECT coalesce(contact_phone,verified_phone) AS phone, phone_discoverable AS enabled FROM users WHERE id=$1', [me.id]);
  return NextResponse.json(result.rows[0], { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: NextRequest) {
  const origin = guardSameOrigin(req); if (origin) return origin;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`phone-discovery:${me.id}`, 20, 60_000)).allowed) return jsonError(429, "Please try again shortly.");
  const body = await readJson(req); if (typeof body?.enabled !== "boolean") return jsonError(400, "Choose a discovery preference.");
  if (body.phone !== undefined && (typeof body.phone !== "string" || (body.phone !== "" && !/^\+[1-9]\d{7,14}$/.test(body.phone)))) return jsonError(422, "Use an international number, such as +923001234567.");
  const result = await pool.query('UPDATE users SET contact_phone=CASE WHEN $3::text IS NULL THEN contact_phone ELSE nullif($3,\'\') END, phone_discoverable=CASE WHEN $3=\'\' THEN false ELSE $1 END WHERE id=$2 AND (coalesce(nullif($3,\'\'),contact_phone,verified_phone) IS NOT NULL OR $1=false) RETURNING id', [body.enabled, me.id, body.phone ?? null]);
  if (!result.rowCount) return jsonError(409, "Add a phone number before enabling discovery.");
  return NextResponse.json({ ok: true });
}
