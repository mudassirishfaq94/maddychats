import { guardReadableUploadBudget } from "@/server/upload-budget";
import { UploadSafetyError } from "@/server/upload-safety";
import { prepareAvatarPhoto } from "@/server/status-photo";
import { readUploadForm } from "@/server/http";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { guardSameOrigin, guardUploadSize, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";

import { CHAT_BACKGROUNDS } from "@/lib/chat-backgrounds";

const VALID_PRESETS = CHAT_BACKGROUNDS.map((p) => p.key);

const VALID_PATTERNS = [
  "doodles",
  "dots",
  "stripes",
  "waves",
  "grid",
  "hexagons",
  "circuit",
  "leaves",
];

// Custom doodle styles ("doodle:<sets>:<ink>:<base>:<size>") — validated server-side.
const DOODLE_SET_IDS = new Set(["classic", "creatures", "nature", "playful", "all"]);
function isValidDoodleStyle(value: string): boolean {
  if (!value.startsWith("doodle:")) return false;
  const parts = value.split(":");
  if (parts.length !== 5) return false;
  const [, sets, ink, base, size] = parts;
  const setList = sets === "all" ? ["all"] : sets.split(",");
  if (setList.length === 0 || !setList.every((s) => DOODLE_SET_IDS.has(s))) return false;
  if (!/^#[0-9a-fA-F]{6}$/.test(ink) || !/^#[0-9a-fA-F]{6}$/.test(base)) return false;
  const n = Number(size);
  return Number.isFinite(n) && n >= 0.5 && n <= 2.5;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  const { id } = await params;
  const membership = await getMembership(id, me.id);
  if (!membership) return jsonError(404, "Conversation not found.");

  let body: Record<string, unknown> | null;
  let uploadedImage = false;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const budget = await guardReadableUploadBudget(me.id); if (budget) return budget;
    const oversized = guardUploadSize(req, true);
    if (oversized) return oversized;
    let form: FormData;
    try { form = await readUploadForm(req); }
    catch (error) { return jsonError(error instanceof Error && error.message === "body_too_large" ? 413 : 400, "Invalid or oversized image upload."); }
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(422, "Choose an image.");
    if (file.size > 2 * 1024 * 1024) return jsonError(413, "Background images must be 2 MB or smaller after resizing.");
    let prepared;
    try { prepared = await prepareAvatarPhoto(file); }
    catch (error) { return jsonError(error instanceof UploadSafetyError ? error.status : 500, error instanceof UploadSafetyError ? error.message : "Upload failed."); }
    uploadedImage = true;
    body = { backgroundStyle: `data:${prepared.mimeType};base64,${prepared.buffer.toString("base64")}`, backgroundOpacity: 100 };

  } else {
    body = await readJson(req);
  }
  if (!body) return jsonError(400, "Invalid background. Use the image upload button for files.");
  const hasStyle = Object.prototype.hasOwnProperty.call(body, "backgroundStyle");
  if (hasStyle && body.backgroundStyle !== null && typeof body.backgroundStyle !== "string") return jsonError(422, "Invalid background style.");
  const backgroundStyle = typeof body.backgroundStyle === "string" ? body.backgroundStyle.trim() : null;
  if (body.backgroundOpacity !== undefined && (typeof body.backgroundOpacity !== "number" || !Number.isFinite(body.backgroundOpacity))) return jsonError(422, "Invalid background intensity.");
  if (body.backgroundPositionX !== undefined && (typeof body.backgroundPositionX !== "number" || !Number.isFinite(body.backgroundPositionX))) return jsonError(422, "Invalid background position.");
  if (body.backgroundPositionY !== undefined && (typeof body.backgroundPositionY !== "number" || !Number.isFinite(body.backgroundPositionY))) return jsonError(422, "Invalid background position.");

  const backgroundOpacity =
    typeof body.backgroundOpacity === "number"
      ? Math.min(100, Math.max(0, Math.round(body.backgroundOpacity)))
      : undefined;
  const backgroundPositionX =
    typeof body.backgroundPositionX === "number"
      ? Math.min(100, Math.max(0, Math.round(body.backgroundPositionX)))
      : undefined;
  const backgroundPositionY =
    typeof body.backgroundPositionY === "number"
      ? Math.min(100, Math.max(0, Math.round(body.backgroundPositionY)))
      : undefined;

  if (backgroundStyle?.startsWith("data:") && !uploadedImage) return jsonError(422, "Use the image upload button for backgrounds.");

  // Validate background style
  if (backgroundStyle !== null) {
    const isPreset = VALID_PRESETS.includes(backgroundStyle);
    const isPattern = VALID_PATTERNS.includes(backgroundStyle) || isValidDoodleStyle(backgroundStyle);
    const isHexColor = /^#[0-9a-fA-F]{3,8}$/.test(backgroundStyle);
    const isRgbOrHsl = /^(rgb|hsl)\(/.test(backgroundStyle);
    const isImageUrl = /^https:\/\//i.test(backgroundStyle) || /^data:image\/(jpeg|png|webp|gif|avif);base64,/i.test(backgroundStyle);
    const isGradient =
      /^linear-gradient\(/.test(backgroundStyle) ||
      /^radial-gradient\(/.test(backgroundStyle);

    if (!isPreset && !isPattern && !isHexColor && !isRgbOrHsl && !isImageUrl && !isGradient) {
      return jsonError(422, "Invalid background style.");
    }
  }

  const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
  if (hasStyle) updatePayload.backgroundStyle = backgroundStyle;
  if (backgroundOpacity !== undefined) updatePayload.backgroundOpacity = backgroundOpacity;
  if (backgroundPositionX !== undefined) updatePayload.backgroundPositionX = backgroundPositionX;
  if (backgroundPositionY !== undefined) updatePayload.backgroundPositionY = backgroundPositionY;

  await db
    .update(conversations)
    .set(updatePayload)
    .where(eq(conversations.id, id));

  return NextResponse.json({
    ok: true,
    backgroundStyle,
    backgroundOpacity: backgroundOpacity ?? null,
    backgroundPositionX: backgroundPositionX ?? null,
    backgroundPositionY: backgroundPositionY ?? null,
  });
}
