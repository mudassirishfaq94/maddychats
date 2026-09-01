import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { requireAdmin } from "@/server/admin";
import { guardSameOrigin, jsonError } from "@/server/http";

/** DELETE /api/admin/messages/[id] — Delete a message */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  try {
    await requireAdmin();
  } catch (e) {
    if ((e as Error).message === "UNAUTHENTICATED") return jsonError(401, "Not authenticated.");
    return jsonError(403, "Admin access required.");
  }

  const { id } = await params;
  const [deleted] = await db
    .delete(messages)
    .where(eq(messages.id, id))
    .returning({ id: messages.id });

  if (!deleted) return jsonError(404, "Message not found.");
  return NextResponse.json({ ok: true });
}
