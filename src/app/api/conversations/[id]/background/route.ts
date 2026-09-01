import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";
import { getMembership } from "@/server/chat";

const VALID_PRESETS = [
  "default",
  "ocean",
  "forest",
  "midnight",
  "sunset",
  "rose",
  "lavender",
  "mint",
];

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

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  const backgroundStyle =
    typeof body.backgroundStyle === "string" ? body.backgroundStyle : null;

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
    const isImageUrl =
      /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(backgroundStyle) ||
      backgroundStyle.startsWith("https://") ||
      backgroundStyle.startsWith("data:image/");
    const isGradient =
      /^linear-gradient\(/.test(backgroundStyle) ||
      /^radial-gradient\(/.test(backgroundStyle);

    if (!isPreset && !isPattern && !isHexColor && !isRgbOrHsl && !isImageUrl && !isGradient) {
      return jsonError(422, "Invalid background style.");
    }
  }

  const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
  if (backgroundStyle !== undefined) updatePayload.backgroundStyle = backgroundStyle;
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
