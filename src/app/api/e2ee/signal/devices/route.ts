import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { e2eeSignalDevices, e2eeSignalPrekeys } from "@/db/schema";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";

const MAX_PREKEYS_PER_UPLOAD = 100;
const MAX_PUBLIC_KEY_LENGTH = 8_192;

type PublicPrekey = { keyId: number; publicKey: string; signature?: string };

function publicValue(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 16 || value.length > MAX_PUBLIC_KEY_LENGTH) return null;
  return value;
}

function parsePrekey(value: unknown, signed: boolean): PublicPrekey | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keyId = input.keyId;
  const publicKey = publicValue(input.publicKey);
  const signature = signed ? publicValue(input.signature) : undefined;
  if (!Number.isInteger(keyId) || !publicKey || (signed && !signature)) return null;
  return { keyId: keyId as number, publicKey, ...(signature ? { signature } : {}) };
}

/**
 * Register public Signal device material. This endpoint deliberately accepts
 * no private identity, prekey, or ratchet state; those values stay local to
 * the browser/WebView's encrypted key store.
 */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const data = await readJson(req);
  if (!data) return jsonError(422, "A valid JSON body is required.");
  const deviceId = publicValue(data.deviceId);
  const identityKey = publicValue(data.identityKey);
  const signingKey = publicValue(data.signingKey);
  const registrationId = typeof data.registrationId === "number" && Number.isInteger(data.registrationId)
    ? data.registrationId
    : null;
  const signedPrekey = parsePrekey(data.signedPrekey, true);
  const kyberPrekey = parsePrekey(data.kyberPrekey, true);
  const rawOneTime = data.oneTimePrekeys;
  if (!deviceId || !identityKey || !signingKey || registrationId === null || !signedPrekey || !kyberPrekey || !Array.isArray(rawOneTime) || rawOneTime.length > MAX_PREKEYS_PER_UPLOAD) {
    return jsonError(422, "Invalid Signal device registration.");
  }
  const oneTimePrekeys = rawOneTime.map((key) => parsePrekey(key, false));
  if (oneTimePrekeys.some((key) => !key)) return jsonError(422, "Invalid one-time prekey.");
  const uniqueIds = new Set(oneTimePrekeys.map((key) => key!.keyId));
  if (uniqueIds.size !== oneTimePrekeys.length) return jsonError(422, "One-time prekey IDs must be unique.");

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(e2eeSignalDevices).where(and(
      eq(e2eeSignalDevices.userId, user.id),
      eq(e2eeSignalDevices.deviceId, deviceId),
    )).limit(1);
    if (existing && (existing.identityKey !== identityKey || existing.signingKey !== signingKey)) {
      return "identity_changed" as const;
    }
    if (existing) {
      await tx.update(e2eeSignalDevices).set({ lastSeenAt: new Date(), revokedAt: null }).where(eq(e2eeSignalDevices.id, existing.id));
    } else {
      await tx.insert(e2eeSignalDevices).values({ userId: user.id, deviceId, identityKey, signingKey, registrationId, lastSeenAt: new Date() });
    }
    await tx.insert(e2eeSignalPrekeys).values({ userId: user.id, deviceId, keyId: signedPrekey.keyId, kind: "signed", publicKey: signedPrekey.publicKey, signature: signedPrekey.signature! })
      .onConflictDoUpdate({ target: [e2eeSignalPrekeys.userId, e2eeSignalPrekeys.deviceId, e2eeSignalPrekeys.kind, e2eeSignalPrekeys.keyId], set: { publicKey: signedPrekey.publicKey, signature: signedPrekey.signature!, createdAt: new Date(), expiresAt: null } });
    await tx.insert(e2eeSignalPrekeys).values({ userId: user.id, deviceId, keyId: kyberPrekey.keyId, kind: "kyber", publicKey: kyberPrekey.publicKey, signature: kyberPrekey.signature! })
      .onConflictDoUpdate({ target: [e2eeSignalPrekeys.userId, e2eeSignalPrekeys.deviceId, e2eeSignalPrekeys.kind, e2eeSignalPrekeys.keyId], set: { publicKey: kyberPrekey.publicKey, signature: kyberPrekey.signature!, createdAt: new Date(), expiresAt: null } });
    if (oneTimePrekeys.length) await tx.insert(e2eeSignalPrekeys).values(oneTimePrekeys.map((key) => ({ userId: user.id, deviceId, keyId: key!.keyId, kind: "one_time", publicKey: key!.publicKey }))).onConflictDoNothing();
    return "ok" as const;
  });
  if (result === "identity_changed") return jsonError(409, "A different Signal identity is already registered for this device.");
  return NextResponse.json({ success: true, acceptedOneTimePrekeys: oneTimePrekeys.length });
}
