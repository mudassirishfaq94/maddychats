import { NextRequest } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { db } from "@/db";
import { fcmTokens, users } from "@/db/schema";
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
  if (!body || typeof body.token !== "string" || body.token.length < 10 || body.token.length > 4096) {
    return jsonError(400, "Valid FCM token required.");
  }

  const platform = typeof body.platform === "string" ? body.platform.slice(0, 20) : "android";

  // The same physical device can switch accounts without rotating its FCM
  // token. Route future alerts to the signed-in account, never the old owner.
  await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
    await tx.delete(fcmTokens).where(and(eq(fcmTokens.userId, user.id), eq(fcmTokens.platform, platform), ne(fcmTokens.token, body.token as string)));
    await tx.insert(fcmTokens).values({ userId: user.id, token: body.token as string, platform })
      .onConflictDoUpdate({ target: fcmTokens.token, set: { userId: user.id, platform, updatedAt: new Date() } });
  });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * DELETE /api/push/register — Remove the caller's FCM tokens.
 */
export async function DELETE(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  await db.delete(fcmTokens).where(eq(fcmTokens.userId, user.id));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
