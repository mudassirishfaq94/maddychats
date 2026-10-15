import { guardReadableUploadBudget } from "@/server/upload-budget";
import { UploadSafetyError } from "@/server/upload-safety";
import { prepareAvatarPhoto } from "@/server/status-photo";
import { readUploadForm } from "@/server/http";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { guardSameOrigin, guardUploadSize, jsonError } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { getGroupWithActor } from "@/server/chat";
import { generateStoredName, LIMITS, saveBuffer } from "@/server/storage";
import { publishToConversation } from "@/server/realtime";
import { isUuid } from "@/server/users";

export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const oversized = guardUploadSize(req, true); if (oversized) return oversized;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const { id } = await params;
  if (!isUuid(id)) return jsonError(404, "Group not found.");
  const ctx = await getGroupWithActor(id, me.id);
  if (!ctx) return jsonError(404, "Group not found.");
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") return jsonError(403, "Only group admins can change the image.");
  const budget = await guardReadableUploadBudget(me.id); if (budget) return budget;
  let form: FormData; try { form = await readUploadForm(req); } catch (error) { return jsonError(error instanceof Error && error.message === "body_too_large" ? 413 : 400, "Invalid or oversized upload."); }
  const entry = form.get("file"); if (!entry || typeof entry === "string") return jsonError(422, "Choose an image.");
  const file = entry as File; if (file.size > LIMITS.avatar) return jsonError(413, "That image is too large.");
  let prepared;
  try { prepared = await prepareAvatarPhoto(file); }
  catch (error) { return jsonError(error instanceof UploadSafetyError ? error.status : 500, error instanceof UploadSafetyError ? error.message : "Upload failed."); }
  const storedName = generateStoredName(prepared.extension);
  await saveBuffer("avatars", storedName, prepared.buffer);
  const avatarUrl = `/api/media/avatars/${storedName}`;
  const [saved] = await db.update(conversations).set({ avatarUrl, updatedAt: new Date() }).where(eq(conversations.id, id)).returning({ updatedAt: conversations.updatedAt });
  await publishToConversation(id, { type: "group:updated", conversationId: id });
  return NextResponse.json({ avatarUrl, updatedAt: saved.updatedAt.toISOString() });
}
