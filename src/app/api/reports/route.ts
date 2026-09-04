import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { createReport } from "@/server/privacy";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  // Rate limit: 5 reports per minute per user
  const rl = rateLimit(`report:${user.id}`, 5, 60_000);
  if (!rl.allowed) {
    return jsonError(429, "Too many reports. Please try again later.");
  }

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const data = body as Record<string, unknown>;
  const type = String(data.type || "");
  const reason = String(data.reason || "");
  const description = data.description ? String(data.description) : undefined;
  const targetUserId = data.targetUserId ? String(data.targetUserId) : undefined;
  const targetMessageId = data.targetMessageId ? String(data.targetMessageId) : undefined;

  if (!type || !reason) {
    return jsonError(422, "Type and reason are required.");
  }

  if (type !== "user" && type !== "message") {
    return jsonError(422, "Type must be 'user' or 'message'.");
  }

  if (type === "user" && !targetUserId) {
    return jsonError(422, "targetUserId is required for user reports.");
  }

  if (type === "message" && !targetMessageId) {
    return jsonError(422, "targetMessageId is required for message reports.");
  }

  const report = await createReport({
    reporterId: user.id,
    type: type as "user" | "message",
    reason,
    description,
    targetUserId,
    targetMessageId,
  });

  return NextResponse.json(report, { status: 201 });
}
