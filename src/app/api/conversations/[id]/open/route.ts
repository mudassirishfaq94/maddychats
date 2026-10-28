import { NextRequest, NextResponse } from "next/server";
import { getConversationForUser, listMessages } from "@/server/chat";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/** One authorized read for a chat's metadata and bounded newest page. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  // As on the former server-rendered route, start the independent reads in
  // parallel. History is never returned unless the authenticated member check
  // succeeds, and the result is kept out of browser/shared HTTP caches.
  let detailAt = startedAt;
  let historyAt = startedAt;
  const detailPromise = getConversationForUser(id, me.id).then((detail) => { detailAt = performance.now(); return detail; });
  const historyPromise = listMessages(id, null, 20, me.id).then((page) => { historyAt = performance.now(); return page; });
  const conversation = await detailPromise;
  if (!conversation) {
    void historyPromise.catch(() => undefined);
    return jsonError(404, "Conversation not found.");
  }
  const initial = await historyPromise;
  const finishedAt = performance.now();
  return NextResponse.json({ viewerId: me.id, conversation, initial }, { headers: {
    "Cache-Control": "no-store",
    "Server-Timing": `detail;dur=${(detailAt-startedAt).toFixed(1)}, history;dur=${(historyAt-startedAt).toFixed(1)}, total;dur=${(finishedAt-startedAt).toFixed(1)}`,
  } });
}
