import { NextRequest } from "next/server";
import { guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";

/**
 * Status replies used to be composed on the server, which necessarily stored
 * them as plaintext. Current clients create the direct conversation and send
 * the formatted reply through the normal client-side E2EE message flow.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");
  return jsonError(426, "Update Circlo to send end-to-end encrypted status replies.");
}
