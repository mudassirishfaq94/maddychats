import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deviceLinkRequests, deviceSessions, e2eeKeys } from "@/db/schema";
import { getDeviceSetupUser, getSessionDeviceId } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function createEntryCode() {
  let value = BigInt(`0x${randomBytes(7).toString("hex")}`) & ((BigInt(1) << BigInt(50)) - BigInt(1));
  let code = "";
  for (let i = 0; i < 10; i++) {
    code = alphabet[Number(value & BigInt(31))] + code;
    value >>= BigInt(5);
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Called on the new, untrusted device. Display the code once; store only its digest. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getDeviceSetupUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const sessionId = await getSessionDeviceId();
  if (!sessionId) return jsonError(409, "Sign in again to link this device.");
  if (!(await rateLimit(`device-link-create:${user.id}`, 5, 60000)).allowed) return jsonError(429, "Please wait before requesting another code.");
  const body = await readJson(req);
  if (typeof body?.deviceId !== "string" || !body.deviceId.trim() || body.deviceId.length > 100) return jsonError(422, "Device ID is required.");
  const deviceId = body.deviceId.trim();
  const result = await db.transaction(async tx => {
    const [session] = await tx.select().from(deviceSessions).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, user.id), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()))).for("update");
    const [device] = await tx.select().from(e2eeKeys).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId))).for("update");
    if (!session || !device || device.trustedAt || device.sessionId !== sessionId) return null;
    await tx.update(deviceLinkRequests).set({ status: "revoked", usedAt: new Date(), entryCodeHash: null }).where(and(eq(deviceLinkRequests.userId, user.id), eq(deviceLinkRequests.deviceId, deviceId), eq(deviceLinkRequests.status, "pending")));
    const token = randomBytes(32).toString("base64url");
    const code = createEntryCode();
    const fingerprint = hash(device.publicKey);
    const [request] = await tx.insert(deviceLinkRequests).values({
      userId: user.id, sessionId, deviceId, fingerprint,
      // The verifier removes the display hyphen before hashing, so store only
      // the canonical ten-character code digest as well.
      codeHash: hash(token), entryCodeHash: hash(code.replaceAll("-", "")),
      expiresAt: new Date(Date.now() + 3 * 60000),
    }).returning({ id: deviceLinkRequests.id, expiresAt: deviceLinkRequests.expiresAt });
    return { ...request, code };
  });
  return result ? NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }) : jsonError(403, "Request a linking code from this new device's signed-in browser.");
}
