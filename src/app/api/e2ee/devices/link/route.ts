import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceLinkRequests, deviceSessions, e2eeKeys } from "@/db/schema";
import { getSessionDeviceId, getSessionUser } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const requests = await db.select({ id: deviceLinkRequests.id, deviceId: deviceLinkRequests.deviceId, fingerprint: deviceLinkRequests.fingerprint, status: deviceLinkRequests.status, expiresAt: deviceLinkRequests.expiresAt })
    .from(deviceLinkRequests).where(and(eq(deviceLinkRequests.userId, user.id), gt(deviceLinkRequests.expiresAt, new Date()))).limit(100);
  return NextResponse.json({ requests }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const user = await getSessionUser(); if (!user) return jsonError(401, "Not authenticated.");
  const sessionId = await getSessionDeviceId(); if (!sessionId) return jsonError(409, "Sign in again to link this browser.");
  if (!(await rateLimit(`device-link-create:${user.id}`, 5, 60000)).allowed) return jsonError(429, "Please wait before requesting another code.");
  const body = await readJson(req);
  if (typeof body?.deviceId !== "string") return jsonError(422, "Device ID is required.");
  const deviceId = body.deviceId;
  const result = await db.transaction(async tx => {
    const [session] = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).for("update");
    const [device] = await tx.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId))).for("update");
    if (!session || !device || device.trustedAt || device.sessionId !== sessionId) return null;
    await tx.update(deviceLinkRequests).set({ status: "revoked" }).where(and(eq(deviceLinkRequests.userId, user.id), eq(deviceLinkRequests.deviceId, deviceId), eq(deviceLinkRequests.status, "pending")));
    const code = randomBytes(8).toString("hex").toUpperCase();
    const fingerprint = createHash("sha256").update(device.publicKey).digest("hex");
    const [request] = await tx.insert(deviceLinkRequests).values({ userId: user.id, sessionId, deviceId, fingerprint, codeHash: createHash("sha256").update(code).digest("hex"), expiresAt: new Date(Date.now() + 5 * 60000) }).returning({ id: deviceLinkRequests.id, expiresAt: deviceLinkRequests.expiresAt });
    return { ...request, code };
  });
  return result ? NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } }) : jsonError(403, "Request linking from this new device's signed-in browser.");
}
