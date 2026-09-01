import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import {
  clientIp,
  guardSameOrigin,
  guardUploadSize,
  jsonError,
} from "@/server/http";
import { getSessionUser } from "@/server/session";
import { toSafeUser } from "@/server/users";
import {
  generateStoredName,
  LIMITS,
  saveBuffer,
  validateUpload,
} from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Uploads (and replaces) the signed-in user's avatar. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const oversized = guardUploadSize(req);
  if (oversized) return oversized;

  const rl = rateLimit(
    `upload-avatar:${clientIp(req)}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) return jsonError(429, "Too many uploads. Try again later.");

  const me = await getSessionUser();
  if (!me) return jsonError(401, "Not authenticated.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Invalid upload.");
  }

  const entry = form.get("file");
  if (!entry || typeof entry === "string") {
    return jsonError(422, "Choose an image to upload.", {
      file: "Choose an image to upload",
    });
  }

  const file = entry as File;
  if (file.size > LIMITS.avatar) {
    return jsonError(413, "That image is too large.", {
      file: `Avatars must be ${Math.round(LIMITS.avatar / 1024 / 1024)} MB or smaller`,
    });
  }

  const check = validateUpload(file.name, file.type, file.size, "avatar");
  if (!check.ok) return jsonError(422, check.error, { file: check.error });

  const storedName = generateStoredName(check.extension);
  const buffer = Buffer.from(await file.arrayBuffer());
  // Re-check the real byte length (Content-Length can lie).
  if (buffer.byteLength > LIMITS.avatar) {
    return jsonError(413, "That image is too large.");
  }

  let relative: string;
  try {
    relative = await saveBuffer("avatars", storedName, buffer);
  } catch {
    return jsonError(500, "Upload failed. Please try again.");
  }

  const avatarUrl = `/api/media/avatars/${storedName}`;
  const updated = await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, me.id))
    .returning();

  return NextResponse.json({
    user: toSafeUser(updated[0]),
    attachment: {
      storedName,
      path: relative,
      size: buffer.byteLength,
      mimeType: file.type,
    },
  });
}
