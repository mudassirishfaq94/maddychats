import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { loadCallIceConfiguration } from "@/server/call-ice";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`call-ice:${user.id}`, 30, 60000)).allowed) return jsonError(429, "Please try again shortly.");
  try {return NextResponse.json(await loadCallIceConfiguration(user.id), { headers: { "Cache-Control": "private, no-store" } });}
  catch{return jsonError(503,"Call connection service is temporarily unavailable. Please try again shortly.");}
}
