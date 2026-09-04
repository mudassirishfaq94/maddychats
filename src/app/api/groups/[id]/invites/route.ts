import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getMembership } from "@/server/chat";
import { createGroupInviteLink, listGroupInviteLinks, revokeGroupInviteLink } from "@/server/group-invites";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** List invite links for a group */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Group not found.");

  const membership = await getMembership(id, user.id);
  if (!membership) return jsonError(404, "Group not found.");
  if (membership.role === "member") return jsonError(403, "Only admins can manage invite links.");

  const links = await listGroupInviteLinks(id);
  return NextResponse.json({ links });
}

/** Create a new invite link */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Group not found.");

  const membership = await getMembership(id, user.id);
  if (!membership) return jsonError(404, "Group not found.");
  if (membership.role === "member") return jsonError(403, "Only admins can create invite links.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;
  const expiresInDays = data.expiresInDays ? Number(data.expiresInDays) : undefined;
  const maxUses = data.maxUses ? Number(data.maxUses) : undefined;

  const link = await createGroupInviteLink(id, user.id, { expiresInDays, maxUses });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maddychats.vercel.app";
  const inviteUrl = `${baseUrl}/invite/${link.code}`;

  return NextResponse.json({ link: { ...link, url: inviteUrl } }, { status: 201 });
}

/** Revoke an invite link */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(404, "Group not found.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;
  const linkId = data.linkId ? String(data.linkId) : null;

  if (!linkId) return jsonError(422, "linkId is required.");

  const revoked = await revokeGroupInviteLink(linkId, user.id);
  if (!revoked) return jsonError(404, "Invite link not found.");

  return NextResponse.json({ success: true });
}
