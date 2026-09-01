import { NextRequest, NextResponse } from "next/server";
import { deleteOwnStatus } from "@/server/status";
import { guardSameOrigin, jsonError } from "@/server/http";
import { publishToUsers } from "@/server/realtime";
import { getSessionUser } from "@/server/session";
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await params; const result = await deleteOwnStatus(id, me.id);
  if (result === "not_found") return jsonError(404, "Status not found.");
  if (result === "forbidden") return jsonError(403, "You can only delete your own status.");
  publishToUsers(result.recipientIds, { type: "status:deleted", statusId: id, userId: me.id });
  return NextResponse.json({ ok: true });
}
