import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { guardSameOrigin, guardUploadSize, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { getGroupWithActor } from "@/server/chat";
import { generateStoredName, LIMITS, saveBuffer, validateUpload } from "@/server/storage";

export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const oversized = guardUploadSize(req); if (oversized) return oversized;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await params; const ctx = await getGroupWithActor(id, me.id);
  if (!ctx) return jsonError(404, "Group not found.");
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") return jsonError(403, "Only group admins can change the image.");
  let form: FormData; try { form = await req.formData(); } catch { return jsonError(400, "Invalid upload."); }
  const entry = form.get("file"); if (!entry || typeof entry === "string") return jsonError(422, "Choose an image.");
  const file = entry as File; if (file.size > LIMITS.avatar) return jsonError(413, "That image is too large.");
  const check = validateUpload(file.name, file.type, file.size, "avatar"); if (!check.ok) return jsonError(422, check.error);
  const storedName = generateStoredName(check.extension); const buffer = Buffer.from(await file.arrayBuffer());
  await saveBuffer("avatars", storedName, buffer);
  const avatarUrl = `/api/media/avatars/${storedName}`;
  await db.update(conversations).set({ avatarUrl, updatedAt: new Date() }).where(eq(conversations.id, id));
  return NextResponse.json({ avatarUrl });
}
