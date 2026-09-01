import { NextRequest } from "next/server";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";
import {
  publishToConversation,
  publishToUsers,
  subscribe,
} from "@/server/realtime";
import {
  addConnection,
  connectionCount,
  peersOf,
  presenceSnapshotFor,
  removeConnection,
  touch,
} from "@/server/presence";
import { markDeliveredFor } from "@/server/chat";
import type { RealtimeEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream — realtime transport + presence channel.
 *
 * On connect we register presence, sweep undelivered messages, and push a
 * presence snapshot. Heartbeats keep the connection warm and refresh
 * in-memory presence WITHOUT writing to PostgreSQL every tick (see
 * `presence.touch`, which flushes at most once a minute).
 */
/** Caps concurrent realtime streams per account (resource-exhaustion guard). */
const MAX_STREAMS_PER_USER = 5;

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  if (connectionCount(me.id) >= MAX_STREAMS_PER_USER) {
    return jsonError(429, "Too many realtime connections.");
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const sendEvent = (event: unknown) =>
        send(`data: ${JSON.stringify(event)}\n\n`);

      send(`: maddy-chats realtime connected\n\n`);

      const unsubscribe = subscribe(me.id, (event: RealtimeEvent) => {
        sendEvent(event);
      });

      // ---- presence: announce this user to everyone who shares a chat ----
      const cameOnline = await addConnection(me.id);
      const peers = await peersOf(me.id);
      if (cameOnline && peers.length > 0) {
        publishToUsers(peers, {
          type: "presence:update",
          userId: me.id,
          online: true,
          lastSeenAt: new Date().toISOString(),
        });
      }

      // ---- snapshot of who is online right now ----
      const snapshot = await presenceSnapshotFor(me.id);
      for (const [userId, state] of Object.entries(snapshot)) {
        sendEvent({
          type: "presence:update",
          userId,
          online: state.online,
          lastSeenAt: state.lastSeenAt,
        });
      }

      // ---- delivery sweep: anything waiting for us is now delivered ----
      try {
        const delivered = await markDeliveredFor(me.id);
        const deliveredAt = new Date().toISOString();
        for (const [conversationId, messageIds] of delivered) {
          await publishToConversation(conversationId, {
            type: "message:delivered",
            conversationId,
            messageIds,
            deliveredAt,
          });
        }
      } catch {
        // delivery sweep must never break the stream
      }

      const heartbeat = setInterval(() => {
        void touch(me.id);
        // Re-verify the session periodically: if the user signed out (token
        // revoked) or the account vanished, close the stream immediately.
        void getSessionUser().then((still) => {
          if (still) {
            send(`: ping ${Date.now()}\n\n`);
          } else {
            cleanup();
          }
        });
      }, HEARTBEAT_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        void (async () => {
          const wentOffline = await removeConnection(me.id);
          if (wentOffline) {
            const list = await peersOf(me.id);
            if (list.length > 0) {
              publishToUsers(list, {
                type: "presence:update",
                userId: me.id,
                online: false,
                lastSeenAt: new Date().toISOString(),
              });
            }
          }
        })();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      req.signal.addEventListener("abort", cleanup, { once: true });
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
