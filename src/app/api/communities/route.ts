import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { createCommunity, listUserCommunities, listPublicCommunities } from "@/server/communities";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** List communities (user's + public) */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const myCommunities = await listUserCommunities(user.id);
  const publicCommunities = await listPublicCommunities();

  return NextResponse.json({ myCommunities, publicCommunities });
}

/** Create a new community */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const name = data.name ? String(data.name).trim() : "";
  if (!name || name.length < 2) return jsonError(422, "Community name is required (min 2 characters).");
  if (name.length > 100) return jsonError(422, "Community name is too long.");

  const community = await createCommunity({
    name,
    description: data.description ? String(data.description).slice(0, 500) : undefined,
    createdBy: user.id,
    isPublic: data.isPublic !== false,
  });

  return NextResponse.json({ community }, { status: 201 });
}
