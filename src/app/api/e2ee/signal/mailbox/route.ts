import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { e2eeSignalDevices, e2eeSignalEnvelopes } from "@/db/schema";
import { guardSameOrigin, jsonError } from "@/server/http";
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

  if (envelopes.length) {
    const now = new Date();
    await Promise.all(envelopes.map((envelope) => db.update(e2eeSignalEnvelopes)
      .set({ deliveredAt: now })
      .where(and(eq(e2eeSignalEnvelopes.id, envelope.id), isNull(e2eeSignalEnvelopes.deliveredAt)))));
  }
  return NextResponse.json({ envelopes: envelopes.map(({ ciphertext, ...envelope }) => ({ ...envelope, ciphertext })) });
}
