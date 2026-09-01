import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { jsonError } from "@/server/http";
import { isUuid } from "@/server/users";
import { getMembership, listConversationFiles } from "@/server/chat";

export const dynamic = "force-dynamic";

/** List file (non-image) attachments for a conversation. Members only. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Conversation not found.");

  const membership = await getMembership(id, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  const files = await listConversationFiles(id, me.id);
  return NextResponse.json({ files });
}
