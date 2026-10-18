import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { isUuid } from "@/server/users";
import { getGroupWithActor } from "@/server/chat";
import { createGroupInviteLink, listGroupInviteLinks, revokeGroupInviteLink } from "@/server/group-invites";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { z } from "zod";
import { rateLimit } from "@/server/rate-limit";
import { clientUrl } from "@/server/config";

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

  const context = await getGroupWithActor(id, user.id);
  const membership = context?.membership;
  if (!membership) return jsonError(404, "Group not found.");
  if (!["owner","admin"].includes(membership.role)) return jsonError(403, "Only admins can manage invite links.");

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

  const context = await getGroupWithActor(id, user.id);
  const membership = context?.membership;
  if (!membership) return jsonError(404, "Group not found.");
  if (!["owner","admin"].includes(membership.role)) return jsonError(403, "Only admins can create invite links.");

  const body = await readJson(req);
  const parsed = z.object({ expiresInDays: z.number().int().min(1).max(365).optional(), maxUses: z.number().int().min(1).max(10000).optional() }).strict().safeParse(body ?? {});
  if (!parsed.success) return jsonError(422, "Use an expiry of 1–365 days and a use limit of 1–10000.");
  const limit = await rateLimit(`group-invite:${user.id}`, 20, 60000);
  if (!limit.allowed) return jsonError(429, "Please wait before creating another invite.");
  const link = await createGroupInviteLink(id, user.id, parsed.data).catch(cause=>{if(cause instanceof Error && cause.message==="Only group admins can create invite links.")return null;throw cause;});
  if(!link)return jsonError(403,"Group permissions changed. Only admins can create invite links.");

  const inviteUrl = `${clientUrl()}/invite/${link.code}`;

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

  const context = await getGroupWithActor(id, user.id);
  if (!context) return jsonError(404, "Group not found.");
  if (context.membership.role !== "owner" && context.membership.role !== "admin") return jsonError(403, "Only admins can revoke invite links.");
  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;
  const linkId = data.linkId ? String(data.linkId) : null;

  if (!linkId || !isUuid(linkId)) return jsonError(422, "linkId is required.");

  const revoked = await revokeGroupInviteLink(linkId, user.id, id);
  if (!revoked) return jsonError(404, "Invite link not found.");

  return NextResponse.json({ success: true });
}
