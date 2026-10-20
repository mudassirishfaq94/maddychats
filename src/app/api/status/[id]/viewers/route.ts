import { NextResponse } from "next/server";
import { jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { listStatusViewers } from "@/server/status";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await params; const viewers = await listStatusViewers(id, me.id);
  if (!viewers) return jsonError(404, "Status not found.");
  return NextResponse.json({ viewers });
}
