import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/db";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getConversationForUser } from "@/server/chat";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), conversationId: z.string().uuid(), clientId: z.string().uuid(), sdp: z.string().min(30).max(24000) }),
  z.object({ action: z.literal("answer"), id: z.string().uuid(), clientId: z.string().uuid(), sdp: z.string().min(30).max(24000) }),
  z.object({ action: z.literal("end"), id: z.string().uuid(), clientId: z.string().uuid() }),
  z.object({ action: z.literal("heartbeat"), id: z.string().uuid(), clientId: z.string().uuid() }),
]);
function publicCall(call: Record<string, unknown> | null, userId: string, clientId: string | undefined) {
  if (!call) return null;
  const { caller_client, callee_client, ...safe } = call;
  return { ...safe, owned: (call.caller_id === userId ? caller_client : callee_client) === clientId };
}
export async function GET(req: NextRequest) {
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`call-read:${me.id}`, 180, 60_000)).allowed) return jsonError(429, "Please try again shortly.");
  const result = await pool.query(`SELECT c.*, u.display_name AS peer_name FROM audio_calls c
    JOIN users u ON u.id=CASE WHEN c.caller_id=$1 THEN c.callee_id ELSE c.caller_id END
    WHERE (c.caller_id=$1 OR c.callee_id=$1) AND c.state <> 'ended' AND c.expires_at>now()
    ORDER BY c.created_at DESC LIMIT 1`, [me.id]);
  const call = result.rows[0];
  if (call) {
    const chat = await getConversationForUser(call.conversation_id, me.id);
    if (!chat || chat.blocked || chat.requestPending || chat.awaitingApproval) return NextResponse.json({ call: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ call: publicCall(call ?? null, me.id, req.headers.get("X-Call-Client") ?? undefined) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: NextRequest) {
  const origin = guardSameOrigin(req); if (origin) return origin;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`call-write:${me.id}`, 100, 60_000)).allowed) return jsonError(429, "Please try again shortly.");
  const parsed = input.safeParse(await readJson(req)); if (!parsed.success) return jsonError(400, "Invalid call request.");
  const body = parsed.data;
  if (body.action === "invite" && !(await rateLimit(`call-invite:${me.id}`, 8, 60_000)).allowed) return jsonError(429, "Please wait before calling again.");
  // Reject video/data channels: this release is audio only. Bound SDP before persistence.
  if ("sdp" in body && (!body.sdp.includes("m=audio ") || /(?:^|\r?\n)m=(?!audio )/.test(body.sdp))) return jsonError(400, "Only audio calls are supported.");
  const connection = await pool.connect();
  let call;
  try {
    await connection.query("BEGIN");
    let conversationId: string;
    if (body.action === "invite") conversationId = body.conversationId;
    else {
      const row = await connection.query("SELECT * FROM audio_calls WHERE id=$1 AND (caller_id=$2 OR callee_id=$2)", [body.id, me.id]);
      if (!row.rows[0]) { await connection.query("ROLLBACK"); return jsonError(404, "Call not found."); }
      conversationId = row.rows[0].conversation_id;
    }
    const authorized = await connection.query(`SELECT peer.user_id FROM conversations c
      JOIN conversation_members mine ON mine.conversation_id=c.id AND mine.user_id=$2 AND mine.accepted_at IS NOT NULL
      JOIN conversation_members peer ON peer.conversation_id=c.id AND peer.user_id<>$2 AND peer.accepted_at IS NOT NULL
      WHERE c.id=$1 AND c.type='dm' AND c.deleted_at IS NULL
      AND (SELECT count(*) FROM conversation_members WHERE conversation_id=c.id)=2
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=peer.user_id) OR (b.blocker_id=peer.user_id AND b.blocked_id=$2))`, [conversationId, me.id]);
    if (!authorized.rows[0]) {
      await connection.query("ROLLBACK"); return jsonError(403, "Calls require an accepted, unblocked one-to-one chat.");
    }
    const peer = { id: authorized.rows[0].user_id as string };
    // Lock both accounts in stable order: simultaneous cross-calls cannot both start.
    for (const id of [me.id, peer.id].sort()) await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 46))", [id]);
    if (body.action === "invite") {
      const busy = await connection.query("SELECT 1 FROM audio_calls WHERE state <> 'ended' AND expires_at>now() AND (caller_id=ANY($1::uuid[]) OR callee_id=ANY($1::uuid[])) LIMIT 1", [[me.id, peer.id]]);
      if (busy.rowCount) { await connection.query("ROLLBACK"); return jsonError(409, "One of you is already in a call. Try again shortly."); }
      call = (await connection.query("INSERT INTO audio_calls(conversation_id,caller_id,callee_id,caller_client,offer) VALUES($1,$2,$3,$4,$5) RETURNING *", [conversationId, me.id, peer.id, body.clientId, body.sdp])).rows[0];
    } else if (body.action === "answer") {
      call = (await connection.query("UPDATE audio_calls SET answer=$1, callee_client=$2, state='active', caller_seen_at=now(), callee_seen_at=now(), expires_at=now()+interval '45 seconds' WHERE id=$3 AND callee_id=$4 AND state='ringing' AND expires_at>now() RETURNING *", [body.sdp, body.clientId, body.id, me.id])).rows[0];
    } else {
      const ending = body.action === "end";
      call = (await connection.query(`UPDATE audio_calls SET ${ending ? "state='ended', offer='', answer=NULL" : "caller_seen_at=CASE WHEN caller_id=$2 THEN now() ELSE caller_seen_at END, callee_seen_at=CASE WHEN callee_id=$2 THEN now() ELSE callee_seen_at END, expires_at=LEAST(now(),CASE WHEN caller_id=$2 THEN callee_seen_at ELSE caller_seen_at END)+interval '45 seconds'"}
        WHERE id=$1 AND expires_at>now() AND state <> 'ended' AND
        ((caller_id=$2 AND caller_client=$3) OR (callee_id=$2 AND (callee_client=$3 ${ending ? "OR state='ringing'" : ""}))) RETURNING *`, [body.id, me.id, body.clientId])).rows[0];
    }
    if (!call) { await connection.query("ROLLBACK"); return jsonError(409, "This call expired or was answered on another browser."); }
    // Keep signaling ephemeral. No SDP/IP history is retained after calls finish.
    await connection.query("DELETE FROM audio_calls WHERE expires_at < now() OR state='ended'");
    if (body.action !== "heartbeat") await connection.query("INSERT INTO realtime_events(user_id,payload) SELECT unnest($1::uuid[]),$2::jsonb", [[me.id, peer.id], JSON.stringify({ type: "call:changed", conversationId })]);
    await connection.query("COMMIT");
    return NextResponse.json({ call: publicCall(call, me.id, body.clientId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    await connection.query("ROLLBACK");
    return jsonError(503, "Could not update the call. Please try again.");
  } finally { connection.release(); }
}
