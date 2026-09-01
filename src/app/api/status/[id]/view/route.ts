import { NextRequest, NextResponse } from "next/server";
import { guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { markStatusViewed } from "@/server/status";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await params; const result = await markStatusViewed(id, me.id);
  if (result === "not_found") return jsonError(404, "Status not found.");
  return NextResponse.json({ ok: true, counted: result === "ok" });
}
