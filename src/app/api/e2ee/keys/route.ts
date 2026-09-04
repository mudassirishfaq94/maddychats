import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { isUuid } from "@/server/users";

export const dynamic = "force-dynamic";

/**
 * List device keys. Without ?userId the caller gets their own keys; with
 * ?userId=<uuid> they get that user's PUBLIC keys (needed for key exchange).
 * Public keys are public by design — they can only encrypt, never decrypt.
 */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const targetId = req.nextUrl.searchParams.get("userId");
  if (targetId && !isUuid(targetId)) {
    return jsonError(422, "Invalid userId.");
  }
  const ownerId = targetId && isUuid(targetId) ? targetId : user.id;

  const keys = await db
    .select({
      id: e2eeKeys.id,
      deviceId: e2eeKeys.deviceId,
      publicKey: e2eeKeys.publicKey,
      createdAt: e2eeKeys.createdAt,
      lastUsedAt: e2eeKeys.lastUsedAt,
    })
    .from(e2eeKeys)
    .where(eq(e2eeKeys.userId, ownerId));

  return NextResponse.json({ keys });
}

/** Register a new device key */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const deviceId = data.deviceId ? String(data.deviceId) : null;
  const publicKey = data.publicKey ? String(data.publicKey) : null;
  const encryptedPrivateKey = data.encryptedPrivateKey ? String(data.encryptedPrivateKey) : null;

  if (!deviceId || !publicKey || !encryptedPrivateKey) {
    return jsonError(422, "deviceId, publicKey, and encryptedPrivateKey are required.");
  }

  // Upsert: update if device already registered, insert otherwise
  const [existing] = await db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId)))
    .limit(1);

  if (existing) {
    await db
      .update(e2eeKeys)
      .set({ publicKey, encryptedPrivateKey, lastUsedAt: new Date() })
      .where(eq(e2eeKeys.id, existing.id));
  } else {
    await db.insert(e2eeKeys).values({
      userId: user.id,
      deviceId,
      publicKey,
      encryptedPrivateKey,
    });
  }

  return NextResponse.json({ success: true });
}
