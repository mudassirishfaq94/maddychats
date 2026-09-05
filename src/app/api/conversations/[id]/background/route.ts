import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { guardSameOrigin, guardUploadSize, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";

import { CHAT_BACKGROUNDS } from "@/lib/chat-backgrounds";
import { validateUpload } from "@/server/storage";

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
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const oversized = guardUploadSize(req);
    if (oversized) return oversized;
    let form: FormData;
    try { form = await req.formData(); }
    catch { return jsonError(400, "Invalid image upload."); }
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError(422, "Choose an image.");
    if (file.size > 2 * 1024 * 1024) return jsonError(413, "Background images must be 2 MB or smaller after resizing.");
    const checked = validateUpload(file.name, file.type, file.size, "avatar");
    if (!checked.ok) return jsonError(422, checked.error);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return jsonError(422, "Use a JPG, PNG, or WebP image.");
    body = { backgroundStyle: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`, backgroundOpacity: 100 };
  } else {
    body = await readJson(req);
  }
  if (!body) return jsonError(400, "Invalid background. Use the image upload button for files.");
  const hasStyle = Object.prototype.hasOwnProperty.call(body, "backgroundStyle");
  if (hasStyle && body.backgroundStyle !== null && typeof body.backgroundStyle !== "string") return jsonError(422, "Invalid background style.");
  const backgroundStyle = typeof body.backgroundStyle === "string" ? body.backgroundStyle.trim() : null;
  if (body.backgroundOpacity !== undefined && (typeof body.backgroundOpacity !== "number" || !Number.isFinite(body.backgroundOpacity))) return jsonError(422, "Invalid background intensity.");

  const backgroundOpacity =
    typeof body.backgroundOpacity === "number"
      ? Math.min(100, Math.max(0, Math.round(body.backgroundOpacity)))
      : undefined;

  // Validate background style
  if (backgroundStyle !== null) {
    const isPreset = VALID_PRESETS.includes(backgroundStyle);
    const isPattern = VALID_PATTERNS.includes(backgroundStyle);
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

  await db
    .update(conversations)
    .set(updatePayload)
    .where(eq(conversations.id, id));

  return NextResponse.json({
    ok: true,
    backgroundStyle,
    backgroundOpacity: backgroundOpacity ?? null,
  });
}
