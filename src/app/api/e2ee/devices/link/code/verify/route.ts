import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceLinkRequests, deviceSessions, e2eeKeys } from "@/db/schema";
import { getDeviceSetupUser, getSessionDeviceId } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** A linked device exchanges the one-time code for the QR-equivalent approval token. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getDeviceSetupUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const sessionId = await getSessionDeviceId();
  if (!sessionId) return jsonError(403, "Use a linked device to enter this code.");
  if (!(await rateLimit(`device-link-code-verify:${user.id}`, 5, 10 * 60000)).allowed) return jsonError(429, "Too many tries. Wait a few minutes before trying another code.");
  const body = await readJson(req);
  if (typeof body?.deviceId !== "string" || !body.deviceId.trim() || body.deviceId.length > 100) return jsonError(422, "Choose the linked device you are using.");
  if (typeof body?.code !== "string" || !/^[23456789A-HJ-NP-Z]{5}-?[23456789A-HJ-NP-Z]{5}$/i.test(body.code.trim())) return jsonError(422, "Enter the 10-character code shown on the new device.");
  const normalized = body.code.trim().replaceAll("-", "").toUpperCase();
  const sourceDeviceId = body.deviceId.trim();
  const token = randomBytes(32).toString("base64url");
  const result = await db.transaction(async tx => {
    const [sourceSession] = await tx.select({ id: deviceSessions.id }).from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).for("update");
    if (!sourceSession) return null;
    const [trustedSource] = await tx.select({ deviceId: e2eeKeys.deviceId }).from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, sourceDeviceId), eq(e2eeKeys.sessionId, sessionId), isNotNull(e2eeKeys.trustedAt))).limit(1);
    if (!trustedSource) return null;
    const [link] = await tx.select().from(deviceLinkRequests).where(and(eq(deviceLinkRequests.userId, user.id), eq(deviceLinkRequests.entryCodeHash, hash(normalized)), eq(deviceLinkRequests.status, "pending"), gt(deviceLinkRequests.expiresAt, new Date()))).for("update").limit(1);
    if (!link || link.sourceDeviceId === trustedSource.deviceId) return null;
    const [targetSession] = await tx.select({ id: deviceSessions.id }).from(deviceSessions).where(and(eq(deviceSessions.id, link.sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).limit(1);
    const [target] = await tx.select({ publicKey: e2eeKeys.publicKey, trustedAt: e2eeKeys.trustedAt, sessionId: e2eeKeys.sessionId }).from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, link.deviceId))).limit(1);
    if (!targetSession || !target || target.trustedAt || target.sessionId !== link.sessionId || hash(target.publicKey) !== link.fingerprint) return null;
    await tx.update(deviceLinkRequests).set({ codeHash: hash(token), entryCodeHash: null, sourceDeviceId: trustedSource.deviceId }).where(eq(deviceLinkRequests.id, link.id));
    return { id: link.id, deviceId: link.deviceId, fingerprint: link.fingerprint, expiresAt: link.expiresAt, token };
  });
  return result ? NextResponse.json(result, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }) : jsonError(404, "That code is invalid, expired, or already used. Check the new device and try again.");
}
