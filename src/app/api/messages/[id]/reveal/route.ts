import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError } from "@/server/http";
import { isUuid } from "@/server/users";
import { rateLimit } from "@/server/rate-limit";
import { revealSelfDestruct } from "@/server/message-lifetime";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`message-reveal:${user.id}`,120,60000)).allowed) return jsonError(429,"Please wait before revealing another message.");
  const { id } = await params; if (!isUuid(id)) return jsonError(404, "Message unavailable.");
  const message = await revealSelfDestruct(id, user.id);
  if (!message) return jsonError(404, "Message expired or unavailable.");
  return NextResponse.json({ message, serverNow: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
