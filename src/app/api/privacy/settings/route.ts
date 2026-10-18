import { z } from "zod";
import { db } from "@/db";
import { userContacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { peersOf, isOnline } from "@/server/presence";
import { publishToUsers } from "@/server/realtime";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { getPrivacySettings, upsertPrivacySettings } from "@/server/privacy";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const settings = await getPrivacySettings(user.id);
  return NextResponse.json(
    settings || {
      profileVisibility: "everyone",
      lastSeenVisibility: "everyone",
      lastSeenContacts: [],
      statusVisibility: "everyone",
      whoCanMessage: "everyone",
      loginAlerts: true,
      readReceipts: true,
      typingIndicators: true,
    }
  );
}

export async function PUT(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const visibility = z.enum(["everyone", "contacts", "nobody"]);
  const parsed = z.object({profileVisibility:visibility.optional(),lastSeenVisibility:z.enum(["everyone","contacts","specific","nobody"]).optional(),lastSeenContacts:z.array(z.string().uuid()).max(1000).optional(),statusVisibility:visibility.optional(),whoCanMessage:visibility.optional(),loginAlerts:z.boolean().optional(),readReceipts:z.boolean().optional(),typingIndicators:z.boolean().optional()}).strict().safeParse(body);
  if (!parsed.success) return jsonError(422, "Invalid privacy settings.");
  if (parsed.data.lastSeenContacts) {
    const contacts = await db.select({id:userContacts.contactId}).from(userContacts).where(eq(userContacts.ownerId,user.id));
    const allowed = new Set(contacts.map(row=>row.id));
    if (parsed.data.lastSeenContacts.some(id=>!allowed.has(id))) return jsonError(422, "Choose saved contacts only.");
    parsed.data.lastSeenContacts=[...new Set(parsed.data.lastSeenContacts)];
  }
  const settings = await upsertPrivacySettings(user.id, parsed.data);
  await publishToUsers(await peersOf(user.id), {type:"presence:update",userId:user.id,online:isOnline(user.id),lastSeenAt:new Date().toISOString()});
  return NextResponse.json(settings);
}
