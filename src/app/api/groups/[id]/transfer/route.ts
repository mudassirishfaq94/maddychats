import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, transferOwnershipSchema } from "@/lib/schemas";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { transferGroupOwnership } from "@/server/chat";
import { publishToConversation } from "@/server/realtime";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
  const parsed = transferOwnershipSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Invalid member.", fieldErrors(parsed.error));
  const { id } = await params; const result = await transferGroupOwnership(id, me.id, parsed.data.userId);
  if (result === "not_found" || result === "member_not_found") return jsonError(404, "Group member not found.");
  if (result === "forbidden") return jsonError(403, "Only the owner can transfer ownership.");
  await publishToConversation(id, { type: "group:member-updated", conversationId: id, userId: parsed.data.userId, role: "owner" });
  return NextResponse.json({ ok: true });
}
