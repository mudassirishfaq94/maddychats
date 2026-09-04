import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getCommunity, joinCommunity, leaveCommunity, getCommunityMembers, createChannel, listChannels } from "@/server/communities";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Get community details */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Community not found.");

  const community = await getCommunity(id);
  if (!community) return jsonError(404, "Community not found.");

  const members = await getCommunityMembers(id);
  const channelsList = await listChannels(id);

  return NextResponse.json({ community, members, channels: channelsList });
}

/** Join/Leave a community or create a channel */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Community not found.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;
  const action = data.action ? String(data.action) : "join";

  if (action === "join") {
    const result = await joinCommunity(id, user.id);
    if (!result.success) return jsonError(400, result.error ?? "Could not join community.");
    return NextResponse.json({ success: true });
  }

  if (action === "leave") {
    await leaveCommunity(id, user.id);
    return NextResponse.json({ success: true });
  }

  if (action === "create_channel") {
    const name = data.name ? String(data.name).trim() : "";
    if (!name) return jsonError(422, "Channel name is required.");

    const channel = await createChannel({
      communityId: id,
      name,
      description: data.description ? String(data.description).slice(0, 500) : undefined,
      type: data.type ? String(data.type) : "text",
      createdBy: user.id,
    });

    return NextResponse.json({ channel }, { status: 201 });
  }

  return jsonError(422, "Unknown action.");
}
