import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { e2eeSignalDevices, e2eeSignalEnvelopes } from "@/db/schema";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 100;

/** Fetch opaque Signal envelopes addressed to the authenticated device. */
export async function GET(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId || deviceId.length > 256) return jsonError(422, "deviceId is required.");
  const [device] = await db.select({ id: e2eeSignalDevices.id }).from(e2eeSignalDevices).where(and(
    eq(e2eeSignalDevices.userId, user.id), eq(e2eeSignalDevices.deviceId, deviceId), isNull(e2eeSignalDevices.revokedAt),
  )).limit(1);
  if (!device) return jsonError(403, "Unknown Signal device.");

  const envelopes = await db.select().from(e2eeSignalEnvelopes).where(and(
    eq(e2eeSignalEnvelopes.recipientUserId, user.id),
    eq(e2eeSignalEnvelopes.recipientDeviceId, deviceId),
    isNull(e2eeSignalEnvelopes.deliveredAt),
  )).orderBy(asc(e2eeSignalEnvelopes.createdAt)).limit(PAGE_SIZE);

  return NextResponse.json({ envelopes: envelopes.map(({ ciphertext, ...envelope }) => ({ ...envelope, ciphertext })) });
}

/** Acknowledge only envelopes that were successfully decrypted and persisted locally. */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const data = await readJson(req);
  const deviceId = typeof data?.deviceId === "string" ? data.deviceId : "";
  const ids = Array.isArray(data?.envelopeIds) ? data.envelopeIds.filter((id): id is string => typeof id === "string") : [];
  if (!deviceId || ids.length === 0 || ids.length > PAGE_SIZE || new Set(ids).size !== ids.length) return jsonError(422, "A deviceId and unique envelopeIds are required.");
  const [device] = await db.select({ id: e2eeSignalDevices.id }).from(e2eeSignalDevices).where(and(
    eq(e2eeSignalDevices.userId, user.id), eq(e2eeSignalDevices.deviceId, deviceId), isNull(e2eeSignalDevices.revokedAt),
  )).limit(1);
  if (!device) return jsonError(403, "Unknown Signal device.");
  const updated = await db.update(e2eeSignalEnvelopes).set({ deliveredAt: new Date() }).where(and(
    inArray(e2eeSignalEnvelopes.id, ids), eq(e2eeSignalEnvelopes.recipientUserId, user.id),
    eq(e2eeSignalEnvelopes.recipientDeviceId, deviceId), isNull(e2eeSignalEnvelopes.deliveredAt),
  )).returning({ id: e2eeSignalEnvelopes.id });
  return NextResponse.json({ acknowledged: updated.map((row) => row.id) });
}
