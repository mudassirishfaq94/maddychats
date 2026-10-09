import { pool } from "@/db";
import { NextRequest } from "next/server";
import { realtimeListener } from "@/server/realtime-listener";

export const dynamic = "force-dynamic";

/** Private readiness; public /api/health remains a liveness probe. */
export async function GET(req: NextRequest) {
  const secret = process.env.HEALTHCHECK_SECRET;
  const headers = { "Cache-Control": "no-store" };
  if (!secret) return Response.json({ ok: false }, { status: 503, headers });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401, headers });
  }
  try {
    // Check the release's repair migration and representative runtime columns,
    // rather than treating an empty but reachable database as ready.
    const query = {
      text: `select (select count(*)=6 from drizzle.__drizzle_migrations
               where created_at in (1791590400000,1791676800000,1791763200000,1791849600000,1791936000000,1792022400000)) as migrated,
             (select count(*) from stored_uploads where false) as uploads,
             (select count(*) from device_sessions where false) as sessions,
             (select count(*) from users where false) as users,
             (select count(*) from e2ee_key_history where false) as history,
             (select count(trusted_at) from e2ee_keys where false) as devices,
             (select count(encrypted) from scheduled_messages where false) as scheduled`,
      query_timeout: 5000,
    };
    const result = await pool.query(query);
    if (!result.rows[0]?.migrated) throw new Error("Schema is behind this release");
    await realtimeListener.check();
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
