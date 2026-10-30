import { guardReadableUploadBudget } from "@/server/upload-budget";
import { prepareReadableUpload, UploadSafetyError } from "@/server/upload-safety";
import { reconstructStatusPhoto } from "@/server/status-photo";
import { readUploadForm } from "@/server/http";
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { guardSameOrigin, guardUploadSize, jsonError, readJson } from "@/server/http";
import { publishToUsers } from "@/server/realtime";
import { getSessionUser } from "@/server/session";
import { createStatus, listVisibleStatuses, visibleRecipientIds, statusChatAudienceIds } from "@/server/status";
import { deleteStored, generateStoredName, saveBuffer } from "@/server/storage";
import { STATUS_MEDIA_OUTPUT_MAX_BYTES, STATUS_UPLOAD_BODY_MAX_BYTES } from "@/lib/media-limits";

export const runtime = "nodejs";
export async function GET() {
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  return NextResponse.json({ statuses: await listVisibleStatuses(me.id) }, { headers: {"Cache-Control":"private, no-store"} });
}

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const me = await getSessionUser(); if (!me) return jsonError(401, "Not authenticated.");
  const contentType = req.headers.get("content-type") ?? "";
  let type: "text" | "image" | "video"; let text: string | null = null; let backgroundStyle: string | null = null;
  let chatAudience=true;
  let privacy: "all" | "selected" = "selected"; let selectedUserIds: string[] = [];
  let mediaPath: string | null = null; let mediaMimeType: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const budget = await guardReadableUploadBudget(me.id); if (budget) return budget;
    const tooLarge = guardUploadSize(req, true, STATUS_UPLOAD_BODY_MAX_BYTES); if (tooLarge) return tooLarge;
    let form: FormData; try { form = await readUploadForm(req, STATUS_UPLOAD_BODY_MAX_BYTES, 120_000); } catch (error) { return jsonError(error instanceof Error && error.message === "body_too_large" ? 413 : 400, "Invalid or oversized upload."); }
    type = "image"; text = String(form.get("caption") ?? "").trim().slice(0, 500) || null;
    chatAudience = form.get("privacy") !== "all" && form.get("privacy") !== "selected";
    privacy = form.get("privacy") === "all" ? "all" : "selected";
    try { const selected: unknown = JSON.parse(String(form.get("selectedUserIds") ?? "[]")); if (!Array.isArray(selected) || !selected.every((id) => typeof id === "string")) return jsonError(422, "Invalid selected users."); selectedUserIds = selected; } catch { return jsonError(422, "Invalid selected users."); }
    const entry = form.get("file"); if (!entry || typeof entry === "string") return jsonError(422, "Choose a file.");
    let prepared;
    try {
      const file = entry as File;
      if (file.size > STATUS_MEDIA_OUTPUT_MAX_BYTES) throw new UploadSafetyError(413, "Status photos and videos must be 50 MB or smaller.");
      // Scanner-equipped installations retain scanning. The starter can only
      // publish reconstructed raster photos; raw readable uploads stay closed.
      if (process.env.STARTER_MODE === "1" && !process.env.CLAMAV_HOST) prepared = await reconstructStatusPhoto(file);
      else prepared = await prepareReadableUpload(file, "message");
    }
    catch (error) { return jsonError(error instanceof UploadSafetyError ? error.status : 500, error instanceof UploadSafetyError ? error.message : "Upload failed."); }
    if (prepared.kind !== "image" && prepared.kind !== "video") return jsonError(422, "Status media must be an image or video.");
    if (prepared.buffer.byteLength > STATUS_MEDIA_OUTPUT_MAX_BYTES) return jsonError(413, "Status media must be 50 MB or smaller after processing.");
    type = prepared.kind;
    const storedName = generateStoredName(prepared.extension);
    try {
      mediaPath = await saveBuffer("statuses", storedName, prepared.buffer);
    } catch (error) { return jsonError(error instanceof UploadSafetyError ? error.status : 503, error instanceof UploadSafetyError ? error.message : "Photo storage is unavailable. Try again later."); }
    mediaMimeType = prepared.mimeType;

  } else {
    const body = await readJson(req); if (!body) return jsonError(400, "Invalid request body.");
    type = "text"; text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 700) return jsonError(422, "Text status must be between 1 and 700 characters.");
    backgroundStyle = typeof body.backgroundStyle === "string" ? body.backgroundStyle.slice(0, 40) : "sunset";
    chatAudience = body.privacy !== "all" && body.privacy !== "selected";
    privacy = body.privacy === "all" ? "all" : "selected";
    selectedUserIds = Array.isArray(body.selectedUserIds) ? body.selectedUserIds.filter((id): id is string => typeof id === "string") : [];
  }
  if(chatAudience) selectedUserIds=await statusChatAudienceIds(me.id);
  selectedUserIds = [...new Set(selectedUserIds)].filter((id) => id !== me.id);
  if (privacy === "selected") {
    if (!selectedUserIds.length && !chatAudience) { if (mediaPath) await deleteStored(mediaPath); return jsonError(422, "Select at least one person."); }
    const valid = selectedUserIds.length ? await db.select({ id: users.id }).from(users).where(inArray(users.id, selectedUserIds)) : [];
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
