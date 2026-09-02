import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";
import { eventsForUser, publishToConversation, publishToUsers } from "@/server/realtime";
import { addConnection, peersOf, presenceSnapshotFor, removeConnection, touch } from "@/server/presence";
import { markDeliveredFor } from "@/server/chat";
import type { RealtimeEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const HEARTBEAT_MS = 25_000;
const POLL_MS = 1_000;
const STREAM_LIFETIME_MS = 280_000;

/** Database-backed SSE stream that remains reliable across Vercel instances. */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let cursor = new Date(Date.now() - 1_000);
      const sent = new Set<string>();
      const send = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };
      const sendEvent = (event: unknown) => send(`data: ${JSON.stringify(event)}\n\n`);
      send(": maddy-chats realtime connected\n\n");

      const cameOnline = await addConnection(me.id);
      const peers = await peersOf(me.id);
      if (cameOnline && peers.length) {
        await publishToUsers(peers, { type: "presence:update", userId: me.id, online: true, lastSeenAt: new Date().toISOString() });
      }
      const snapshot = await presenceSnapshotFor(me.id);
      for (const [userId, state] of Object.entries(snapshot)) {
        sendEvent({ type: "presence:update", userId, online: state.online, lastSeenAt: state.lastSeenAt });
      }
      try {
        const delivered = await markDeliveredFor(me.id);
        const deliveredAt = new Date().toISOString();
        for (const [conversationId, messageIds] of delivered) {
          await publishToConversation(conversationId, { type: "message:delivered", conversationId, messageIds, deliveredAt });
        }
      } catch { /* delivery sweep must not break the stream */ }

      let polling = false;
      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          const rows = await eventsForUser(me.id, cursor);
          for (const row of rows) {
            if (!sent.has(row.id)) {
              sent.add(row.id);
              sendEvent(row.payload as RealtimeEvent);
            }
            if (row.createdAt > cursor) cursor = row.createdAt;
          }
          if (sent.size > 500) sent.clear();
        } catch { /* the next poll retries */ }
        finally { polling = false; }
      };
      const poller = setInterval(() => void poll(), POLL_MS);
      const heartbeat = setInterval(() => {
        void touch(me.id);
        send(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(poller);
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        void removeConnection(me.id).then(async (wentOffline) => {
          if (wentOffline) {
            const list = await peersOf(me.id);
            if (list.length) await publishToUsers(list, { type: "presence:update", userId: me.id, online: false, lastSeenAt: new Date().toISOString() });
          }
        });
        try { controller.close(); } catch { /* already closed */ }
      };
      const lifetime = setTimeout(cleanup, STREAM_LIFETIME_MS);
      req.signal.addEventListener("abort", cleanup, { once: true });
      void poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
