import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { fcmTokens } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { jsonError, readJson, guardSameOrigin } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/**
 * POST /api/push/register — Store an FCM device token.
 *
 * The Capacitor PushNotifications plugin registers an FCM token per device.
 * This endpoint saves it so the server can send native Android notifications
 * through the OS tray (not just in-app VAPID web push).
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  // Rate limit: 10 registrations per minute per user
  const rl = await rateLimit(`push-register:${user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return jsonError(429, "Too many requests. Please try again later.");
  }

  const body = await readJson(req);
  if (!body || typeof body.token !== "string" || body.token.length < 10) {
    return jsonError(400, "Valid FCM token required.");
  }

  const platform = typeof body.platform === "string" ? body.platform.slice(0, 20) : "android";

  // Upsert: if this exact token exists, update the timestamp;
  // if the user already has a token for this platform, replace it.
  const existing = await db
    .select({ id: fcmTokens.id })
    .from(fcmTokens)
    .where(eq(fcmTokens.token, body.token))
    .limit(1);

  if (existing[0]) {
    // Token already stored — just touch the timestamp
    await db
      .update(fcmTokens)
      .set({ updatedAt: new Date() })
      .where(eq(fcmTokens.id, existing[0].id));
  } else {
    // Remove any old token for this user + platform
    await db
      .delete(fcmTokens)
      .where(and(eq(fcmTokens.userId, user.id), eq(fcmTokens.platform, platform)));

    // Insert the new token
    await db.insert(fcmTokens).values({
      userId: user.id,
      token: body.token,
      platform,
    });
  }

  return Response.json({ ok: true });
}

/**
 * DELETE /api/push/register — Remove the caller's FCM tokens.
 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  await db.delete(fcmTokens).where(eq(fcmTokens.userId, user.id));
  return Response.json({ ok: true });
}
