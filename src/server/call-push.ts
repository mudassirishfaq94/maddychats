import { pool } from "@/db";
import { getNotificationPreferences } from "./notification-preferences";
import { sendMessagePush } from "./web-push";

export async function callPushDetail(id: string, userId: string) {
  const result = await pool.query(`SELECT c.id, c.conversation_id, c.expires_at, u.display_name
    FROM notifications n JOIN audio_calls c ON c.id::text=n.data->>'callId'
    JOIN users u ON u.id=c.caller_id JOIN conversations conv ON conv.id=c.conversation_id
    JOIN conversation_members mine ON mine.conversation_id=c.conversation_id AND mine.user_id=$2
    WHERE n.id=$1 AND n.user_id=$2 AND n.type='call' AND n.read_at IS NULL
    AND c.callee_id=$2 AND c.state='ringing' AND c.expires_at>now() AND conv.deleted_at IS NULL
    AND mine.accepted_at IS NOT NULL AND mine.muted_at IS NULL AND mine.archived_at IS NULL
    AND EXISTS(SELECT 1 FROM conversation_members peer WHERE peer.conversation_id=c.conversation_id AND peer.user_id=c.caller_id AND peer.accepted_at IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=c.caller_id) OR (b.blocker_id=c.caller_id AND b.blocked_id=$2))
    AND (u.suspended_at IS NULL OR u.suspended_until<=now())`, [id, userId]);
  const call = result.rows[0]; if (!call) return null;
  const preferences = await getNotificationPreferences(userId);
  if (!preferences.pushNotifications) return null;
  return { recipientId: userId, callId: call.id as string, conversationId: call.conversation_id as string,
    expiresAt: new Date(call.expires_at).toISOString(), title: preferences.showNotificationDetails ? `${String(call.display_name).slice(0,80)} · Circlo` : "Circlo",
    body: "Incoming audio call", silent: !preferences.notificationSound };
}

/** Opaque push only; resolve caller and live call status in the authenticated worker. */
export async function sendCallAlert(notificationId: string, userId: string, callId: string, conversationId: string, cancelled: boolean) {
  const detail = cancelled ? null : await callPushDetail(notificationId, userId);
  if (!cancelled && !detail) return;
  await sendMessagePush(userId, { notificationId, conversationId, messageId: "", callId,
    actorName: "Circlo", preview: "Incoming audio call. Open Circlo to answer.",
    title: detail?.title, body: detail?.body,
    callTtl: detail ? Math.max(1, Math.min(45, Math.ceil((Date.parse(detail.expiresAt)-Date.now())/1000))) : 30,
    silent: detail?.silent, callCancelled: cancelled });
}

/** Missed calls are finalized without requiring either browser to stay online. */
export async function cleanupExpiredCalls() {
  const result = await pool.query(`WITH expired AS (
    DELETE FROM audio_calls WHERE expires_at<=now() RETURNING id,conversation_id,caller_id,callee_id,state
  ), notices AS (
    UPDATE notifications n SET data=n.data || jsonb_build_object('callOutcome',CASE WHEN e.state='ringing' THEN 'missed' ELSE 'ended' END,'preview',CASE WHEN e.state='ringing' THEN 'Missed audio call' ELSE 'Audio call ended' END)
    FROM expired e WHERE n.type='call' AND n.data->>'callId'=e.id::text RETURNING n.id
  ) INSERT INTO realtime_events(user_id,payload)
    SELECT member,jsonb_build_object('type','call:changed','conversationId',conversation_id) FROM expired CROSS JOIN LATERAL unnest(ARRAY[caller_id,callee_id]) member RETURNING id`);
  return result.rowCount ?? 0;
}
