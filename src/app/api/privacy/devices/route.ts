import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceSessions } from "@/db/schema";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { verifyFreshAuthentication } from "@/server/authentication";
import { isUuid } from "@/server/users";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const current = await getSessionDeviceId();
  const sessions = await db.select({ id: deviceSessions.id, userAgent: deviceSessions.userAgent, createdAt: deviceSessions.createdAt, lastSeenAt: deviceSessions.lastSeenAt, expiresAt: deviceSessions.expiresAt }).from(deviceSessions)
    .where(and(eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).orderBy(desc(deviceSessions.lastSeenAt)).limit(100);
  return NextResponse.json({ devices: sessions.map((session) => ({ ...session, current: session.id === current })), legacy: !current }, { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const body = await readJson(req); if (!body) return jsonError(400, "Invalid request.");
  if (!(await rateLimit(`device-revoke:${user.id}`, 10, 600000)).allowed) return jsonError(429, "Too many attempts. Try again later.");
  if (!(await verifyFreshAuthentication(user.id, body))) return jsonError(403, "Confirm your identity to revoke devices.");
  const current = await getSessionDeviceId();
  if (body.allOthers === true) {
    if (!current) return jsonError(409, "Sign in again to manage this device.");
    await db.update(deviceSessions).set({ revokedAt: new Date() }).where(and(eq(deviceSessions.userId, user.id), ne(deviceSessions.id, current)));
  } else {
    if (typeof body.id !== "string" || !isUuid(body.id)) return jsonError(422, "Invalid device.");
    const result = await db.update(deviceSessions).set({ revokedAt: new Date() }).where(and(eq(deviceSessions.id, body.id), eq(deviceSessions.userId, user.id))).returning({ id: deviceSessions.id });
    if (!result.length) return jsonError(404, "Device not found.");
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
