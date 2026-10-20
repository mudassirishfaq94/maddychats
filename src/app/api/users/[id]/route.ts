import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { findUserById, isUuid, toPublicUser } from "@/server/users";
import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/** Public profile of any user (safe public fields only — no email). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "User not found.");

  const user = await findUserById(id);
  if (!user) return jsonError(404, "User not found.");

  return NextResponse.json({ user: toPublicUser(user) });
}
