import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getCommunity, getCommunityMembership, joinCommunity, leaveCommunity, getCommunityMembers, createChannel, listChannels } from "@/server/communities";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

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
  const membership = await getCommunityMembership(id, user.id);
  if (!community.isPublic && !membership) return jsonError(404, "Community not found.");

  const members = await getCommunityMembers(id);
  const channelsList = await listChannels(id);

  return NextResponse.json({ community: { ...community, myRole: membership?.role ?? null }, members, channels: channelsList }, { headers: { "Cache-Control": "private, no-store" } });
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
  const limit = await rateLimit(`community-mutation:${user.id}`, 60, 60 * 1000);
  if (!limit.allowed) {
    const response = jsonError(429, "Too many community changes. Please wait before retrying.");
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

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
    if (name.length > 100) return jsonError(422, "Channel name must be 100 characters or shorter.");

    let channel;
    try { channel = await createChannel({
      communityId: id,
      name,
      description: data.description ? String(data.description).slice(0, 500) : undefined,
      type: data.type ? String(data.type) : "text",
      createdBy: user.id,
    }); } catch (error) {
      if (error instanceof Error && error.message === "community_not_found") return jsonError(404, "Community not found.");
      if (error instanceof Error && error.message === "community_channel_forbidden") return jsonError(403, "Only community owners and admins can create channels.");
      throw error;
    }

    return NextResponse.json({ channel }, { status: 201 });
  }

  return jsonError(422, "Unknown action.");
}
