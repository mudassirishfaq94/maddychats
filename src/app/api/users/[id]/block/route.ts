import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError } from "@/server/http";
import { findUserById, isUuid } from "@/server/users";
import { blockUser, unblockUser } from "@/server/chat";

export const dynamic = "force-dynamic";

/** Block a user. Enforced server-side on every messaging path. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "User not found.");
  if (id === me.id) {
    return jsonError(422, "You cannot block yourself.");
  }

  const target = await findUserById(id);
  if (!target) return jsonError(404, "User not found.");

  await blockUser(me.id, target.id);
  return NextResponse.json({ ok: true, blocked: true });
}

/** Unblock a user. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "User not found.");

  await unblockUser(me.id, id);
  return NextResponse.json({ ok: true, blocked: false });
}
