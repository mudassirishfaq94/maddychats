import { NextRequest, NextResponse } from "next/server";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { acceptGroupInvite } from "@/server/group-invites";
import { rateLimit } from "@/server/rate-limit";
import { publishToConversation } from "@/server/realtime";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const body = await readJson(req) as { code?: unknown } | null;
  if (typeof body?.code !== "string" || !/^(?:[a-f0-9]{12}|[a-f0-9]{32})$/.test(body.code)) return jsonError(422, "Invalid invite link.");
  const limit = await rateLimit(`group-join:${user.id}`, 20, 60000);
  if (!limit.allowed) return jsonError(429, "Please wait before joining another group.");
  const result = await acceptGroupInvite(body.code, user.id);
  if (!result.success || !result.conversationId) return jsonError(409, result.error ?? "Could not join this group.");
  await publishToConversation(result.conversationId, { type: "group:member-added", conversationId: result.conversationId, userId: user.id, role: "member" });
  return NextResponse.json({ conversationId: result.conversationId });
}
