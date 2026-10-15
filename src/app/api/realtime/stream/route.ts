import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { pool } from "@/db";
import { getSessionUser, resolveSessionToken } from "@/server/session";
import { SESSION_COOKIE } from "@/server/config";
import { jsonError } from "@/server/http";
import { publishToUsers, publishToConversation } from "@/server/realtime";
import { realtimeListener, type Delivery } from "@/server/realtime-listener";
import { addConnection, connectionCount, peersOf, presenceSnapshotFor, removeConnection, touch } from "@/server/presence";
import { markDeliveredFor } from "@/server/chat";
import { isUuid } from "@/server/users";
import { startStarterMaintenance } from "@/server/starter-maintenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!me || !token) return jsonError(401, "Not authenticated.");
  startStarterMaintenance();
  if (connectionCount(me.id) >= 5) return jsonError(429, "Too many realtime connections.");
  const lastId = req.headers.get("last-event-id");
  if (lastId && !isUuid(lastId)) return jsonError(400, "Invalid event cursor.");
  let consume: (row: Delivery | null) => void = () => undefined;
  let ready = false;
  const early: (Delivery | null)[] = [];
  let unsubscribe: () => void;
  try {
    // Commit LISTEN before reading catch-up rows: avoids the initial race.
    unsubscribe = await realtimeListener.subscribe(me.id, (row) => {
      if (ready) consume(row);
      else if (early.length < 4000) early.push(row);
      else early[0] = null;
    });
  } catch { return jsonError(503, "Realtime is temporarily unavailable."); }
  let stop = () => unsubscribe();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false, registered = false;
      const seen = new Set<string>();
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let eligibility: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (closed) return;
        closed = true; unsubscribe();
        clearInterval(heartbeat); clearInterval(eligibility); clearTimeout(lifetime);
        req.signal.removeEventListener("abort", cleanup);
        if (registered) void removeConnection(me.id).then(async (wentOffline) => {
          if (wentOffline) await publishToUsers(await peersOf(me.id), { type: "presence:update", userId: me.id, online: false, lastSeenAt: new Date().toISOString() });
        }).catch(() => undefined);
        try { controller.close(); } catch { /* already canceled */ }
      };
      stop = cleanup;
      const send = (text: string) => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) <= 0) { cleanup(); return; }
        try { controller.enqueue(encoder.encode(text)); } catch { cleanup(); }
      };
      const deliver = (row: Delivery | null) => {
        if (!row) { cleanup(); return; }
        if (seen.has(row.id) || closed) return;
        // Expire ephemeral state using the server clock, including reconnect
        // replay. A phone with a mis-set clock must still see live typing.
        if (row.payload.type === "typing:update") {
          const expiry = Date.parse(row.payload.expiresAt);
          if (!Number.isFinite(expiry) || expiry <= Date.now()) return;
        }
        seen.add(row.id);
        if (seen.size > 5000) seen.delete(seen.values().next().value!);
        send(`id: ${row.id}\ndata: ${JSON.stringify(row.payload)}\n\n`);
      };
      consume = deliver;
      req.signal.addEventListener("abort", cleanup, { once: true });
      try {
        if (req.signal.aborted || early.includes(null)) { cleanup(); return; }
        const registration = addConnection(me.id); registered = true;
        await registration;
        if (closed || connectionCount(me.id) > 5) { cleanup(); return; }
        send(": ziptalk realtime connected\nretry: 1000\n\n");
        const snapshot = await presenceSnapshotFor(me.id);
        for (const [userId, state] of Object.entries(snapshot)) send(`id: ${randomUUID()}\ndata: ${JSON.stringify({ type: "presence:update", userId, ...state })}\n\n`);
        // Resume replays retained rows, including transactions committed out of
        // timestamp order. The browser suppresses duplicates by durable event ID.
        const since = new Date(Date.now() - (lastId ? 600000 : 1000));
        let cursor: { stamp: string; id: string } | undefined;
        for (let pages = 0; !closed; pages++) {
          const query = {
            text: `SELECT id,user_id AS "userId",payload,created_at::text AS stamp FROM realtime_events
              WHERE user_id=$1 AND created_at >= $2 AND ($3::timestamptz IS NULL OR (created_at,id)>($3::timestamptz,$4::uuid))
              ORDER BY created_at,id LIMIT 200`,
            values: [me.id, since, cursor?.stamp ?? null, cursor?.id ?? null], query_timeout: 5000,
          };
          const result = await pool.query<Delivery & { stamp: string }>(query);
          for (const row of result.rows) deliver(row);
          if (result.rows.length < 200) break;
          const last = result.rows[result.rows.length - 1]; cursor = { stamp: last.stamp, id: last.id };
          if (pages >= 24) {
            // Large gaps use an authoritative page refresh rather than an
            // endless replay/reconnect cycle or an unbounded in-memory queue.
            send("event: resync\ndata: {}\n\n");
            break;
          }
        }
        ready = true;
        for (const row of early.splice(0)) deliver(row);
        if (closed) return;
        let checking = false;
        eligibility = setInterval(() => {
          if (checking || closed) return;
          checking = true;
          void resolveSessionToken(token).then((user) => { if (!user) cleanup(); }).catch(cleanup).finally(() => { checking = false; });
        }, 5000);
        heartbeat = setInterval(() => { send(": ping\n\n"); void touch(me.id).catch(cleanup); }, 25000);
        lifetime = setTimeout(cleanup, 280000);
        void markDeliveredFor(me.id).then(async (delivered) => {
          for (const [conversationId, messageIds] of delivered) await publishToConversation(conversationId, { type: "message:delivered", conversationId, messageIds, deliveredAt: new Date().toISOString() });
        }).catch(() => undefined);
      } catch { cleanup(); }
    },
    cancel() { stop(); },
  }, { highWaterMark: 256 * 1024, size: (chunk) => chunk.byteLength });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
