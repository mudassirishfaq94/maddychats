import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messageAttachments } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/messages/transcribe
 *
 * Transcribes a voice message using server-side speech recognition.
 * Stores the transcript on the attachment and returns it.
 *
 * For now, returns a client-side transcription hint since server-side
 * speech recognition requires heavy dependencies (whisper, etc.).
 * The actual transcription happens client-side via Web Speech API,
 * and this endpoint stores the result.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const attachmentId = data.attachmentId ? String(data.attachmentId) : null;
  const transcript = data.transcript ? String(data.transcript).slice(0, 5000) : null;

  if (!attachmentId) return jsonError(422, "attachmentId is required.");

  if (transcript) {
    // Store the transcript on the attachment
    await db
      .update(messageAttachments)
      .set({ transcript })
      .where(eq(messageAttachments.id, attachmentId));
  }

  // Check if transcript already exists
  const [existing] = await db
    .select({ transcript: messageAttachments.transcript })
    .from(messageAttachments)
    .where(eq(messageAttachments.id, attachmentId))
    .limit(1);

  return NextResponse.json({
    transcript: existing?.transcript ?? transcript ?? null,
  });
}
