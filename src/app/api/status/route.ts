import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { guardSameOrigin, guardUploadSize, jsonError, readJson } from "@/server/http";
import { publishToUsers } from "@/server/realtime";
import { getSessionUser } from "@/server/session";
import { createStatus, listVisibleStatuses, visibleRecipientIds } from "@/server/status";
import { deleteStored, generateStoredName, saveBuffer, validateUpload } from "@/server/storage";

export const runtime = "nodejs";
export async function GET() {
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  return NextResponse.json({ statuses: await listVisibleStatuses(me.id) });
}

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const contentType = req.headers.get("content-type") ?? "";
  let type: "text" | "image" | "video"; let text: string | null = null; let backgroundStyle: string | null = null;
  let privacy: "all" | "selected" = "all"; let selectedUserIds: string[] = [];
  let mediaPath: string | null = null; let mediaMimeType: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const tooLarge = guardUploadSize(req); if (tooLarge) return tooLarge;
    let form: FormData; try { form = await req.formData(); } catch { return jsonError(400, "Invalid upload."); }
    type = "image"; text = String(form.get("caption") ?? "").trim().slice(0, 500) || null;
    privacy = form.get("privacy") === "selected" ? "selected" : "all";
    try { selectedUserIds = JSON.parse(String(form.get("selectedUserIds") ?? "[]")); } catch { return jsonError(422, "Invalid selected users."); }
    const entry = form.get("file"); if (!entry || typeof entry === "string") return jsonError(422, "Choose a file.");
    const file = entry as File; const check = validateUpload(file.name, file.type, file.size, "message");
    if (!check.ok || (check.kind !== "image" && check.kind !== "video")) return jsonError(422, check.ok ? "Status media must be an image or video." : check.error);
    type = check.kind;
    const storedName = generateStoredName(check.extension); const buffer = Buffer.from(await file.arrayBuffer());
    mediaPath = await saveBuffer("statuses", storedName, buffer); mediaMimeType = file.type;
  } else {
    const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
    type = "text"; text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 700) return jsonError(422, "Text status must be between 1 and 700 characters.");
    backgroundStyle = typeof body.backgroundStyle === "string" ? body.backgroundStyle.slice(0, 40) : "sunset";
    privacy = body.privacy === "selected" ? "selected" : "all";
    selectedUserIds = Array.isArray(body.selectedUserIds) ? body.selectedUserIds.filter((id): id is string => typeof id === "string") : [];
  }
  selectedUserIds = [...new Set(selectedUserIds)].filter((id) => id !== me.id);
  if (privacy === "selected") {
    if (!selectedUserIds.length) { if (mediaPath) await deleteStored(mediaPath); return jsonError(422, "Select at least one person."); }
    const valid = await db.select({ id: users.id }).from(users).where(inArray(users.id, selectedUserIds));
    if (valid.length !== selectedUserIds.length) { if (mediaPath) await deleteStored(mediaPath); return jsonError(422, "One or more selected users are invalid."); }
  }
  const status = await createStatus({ userId: me.id, type, text, mediaPath, mediaMimeType, backgroundStyle, privacy, selectedUserIds });
  await publishToUsers(await visibleRecipientIds(status), { type: "status:new", statusId: status.id, userId: me.id });
  return NextResponse.json({ status: {
    id: status.id,
    type: status.type,
    createdAt: status.createdAt.toISOString(),
    expiresAt: status.expiresAt.toISOString(),
    mediaUrl: status.mediaPath ? `/api/media/status/${status.id}` : null,
  } }, { status: 201 });
}
