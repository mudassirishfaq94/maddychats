import { NextRequest, NextResponse } from "next/server";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { publishToUsers } from "@/server/realtime";
import { getSessionUser } from "@/server/session";
import { reactToStatus, visibleRecipientIds } from "@/server/status";
const ALLOWED = new Set(["❤️", "😂", "😮", "😢", "🔥", "👍"]);
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
  const emoji = typeof body.emoji === "string" && ALLOWED.has(body.emoji) ? body.emoji : null;
  if (body.emoji !== null && !emoji) return jsonError(422, "Invalid reaction.");
  const { id } = await params; const result = await reactToStatus(id, me.id, emoji);
  if (result === "not_found") return jsonError(404, "Status not found.");
  if (result === "forbidden") return jsonError(403, "You cannot react to your own status.");
  await publishToUsers(await visibleRecipientIds(result), { type: "status:reaction", statusId: id, userId: me.id });
  return NextResponse.json({ ok: true, emoji });
}
