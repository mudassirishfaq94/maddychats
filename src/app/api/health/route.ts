import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // A public endpoint is useful for liveness probes, but it must not reveal
  // database availability to unauthenticated callers. Configure this secret
  // for an authenticated readiness probe when that signal is needed.
  const secret = process.env.HEALTHCHECK_SECRET;
  const authorized = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) return new NextResponse(null, { status: 204 });
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
