import { NextRequest, NextResponse } from "next/server";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { clientIp, guardSameOrigin, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { starMessage, unstarMessage, getMessageDTO } from "@/server/chat";

export const dynamic = "force-dynamic";

/** Star a message. Membership is verified server-side. */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(_req);
  if (blocked) return blocked;

  const rl = rateLimit(
    `star:${clientIp(_req)}`,
    AUTH_RATE_LIMIT.limit * 2,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Message not found.");

  const result = await starMessage(id, me.id);
  if (result === "not_found") return jsonError(404, "Message not found.");
  if (result === "no_membership")
    return jsonError(404, "Message not found.");

  const dto = await getMessageDTO(id, me.id);
  return NextResponse.json({ ok: true, message: dto });
}

/** Unstar a message. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Message not found.");

  await unstarMessage(id, me.id);

  const dto = await getMessageDTO(id, me.id);
  return NextResponse.json({ ok: true, message: dto });
}
