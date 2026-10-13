import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys, deviceSessions, users } from "@/db/schema";
import { getSessionUser, getSessionDeviceId } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { isUuid } from "@/server/users";
import { publishToConversation } from "@/server/realtime";
import { rateLimit } from "@/server/rate-limit";
import { detectCountry } from "@/server/country";
import { platformLabel } from "@/server/device-meta";

const MAX_DEVICE_NAME = 60;

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

  const rows = await db
    .select({
      id: e2eeKeys.id,
      deviceId: e2eeKeys.deviceId,
      publicKey: e2eeKeys.publicKey,
      encryptedPrivateKey: e2eeKeys.encryptedPrivateKey,
      trustedAt: e2eeKeys.trustedAt,
      createdAt: e2eeKeys.createdAt,
      lastUsedAt: e2eeKeys.lastUsedAt,
      browser: deviceSessions.userAgent,
      sessionExpiresAt: deviceSessions.expiresAt,
      sessionRevokedAt: deviceSessions.revokedAt,
      deviceName: e2eeKeys.deviceName,
      country: e2eeKeys.country,
      platform: e2eeKeys.platform,
    })
    .from(e2eeKeys)
    .leftJoin(deviceSessions, and(eq(deviceSessions.id, e2eeKeys.sessionId), eq(deviceSessions.userId, e2eeKeys.userId)))
    .where(eq(e2eeKeys.userId, ownerId));

  // Private-key backups are only returned to their authenticated owner. A
  // peer can receive the public key only, which is all key exchange needs.
  const keys = rows.filter((key) => !targetId || key.trustedAt).map((key) => targetId ? {
    id: key.id,
    deviceId: key.deviceId,
    publicKey: key.publicKey,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  } : { ...key, sessionState: key.sessionRevokedAt ? "revoked" : key.sessionExpiresAt ? (key.sessionExpiresAt.getTime() <= Date.now() ? "expired" : "active") : "unknown" });

  return NextResponse.json({ keys }, { headers: { "Cache-Control": "no-store" } });
}

/** Register a new device key */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  if (!(await rateLimit(`device-registration:${user.id}`, 20, 60000)).allowed) return jsonError(429, "Too many device registrations. Please wait.");

  const body = await readJson(req);
  const data = (body ?? {}) as Record<string, unknown>;

  const deviceId = data.deviceId ? String(data.deviceId) : null;
  const publicKey = data.publicKey ? String(data.publicKey) : null;
  const encryptedPrivateKey = data.encryptedPrivateKey ? String(data.encryptedPrivateKey) : null;

  if (!deviceId || !publicKey || !encryptedPrivateKey || deviceId.length > 100 || publicKey.length > 8192 || encryptedPrivateKey.length > 16384) {
    return jsonError(422, "deviceId, publicKey, and encryptedPrivateKey are required.");
  }

  // Optional, display-only identity. A label the user chose wins; otherwise the
  // browser family is derived from the request so the device list is readable.
  const requestedName = typeof data.deviceName === "string" ? data.deviceName.trim().slice(0, MAX_DEVICE_NAME) : "";
  const platform = platformLabel(req.headers.get("user-agent"));
  const sessionId = await getSessionDeviceId();
  // Upsert: update if device already registered, insert otherwise
  const [existing] = await db
    .select({ id: e2eeKeys.id })
    .from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId)))
    .limit(1);

  if (existing) {
    // Never silently replace a device key. Doing that invalidates every
    // conversation key previously wrapped for this device and makes older
    // messages permanently unreadable. The client restores the encrypted
    // backup first when it sees this conflict.
    const [registered] = await db
      .select({ publicKey: e2eeKeys.publicKey })
      .from(e2eeKeys)
      .where(eq(e2eeKeys.id, existing.id))
      .limit(1);
    if (registered && registered.publicKey !== publicKey) {
      return jsonError(409, "A different encryption key is already registered for this device.");
    }
    // Trust and the session binding are deliberately untouched here. Rebinding
    // a device to a new session requires the bind-session proof, because the
    // session binding is what lets this device hand out trust to another one.
    const detectedCountry = sessionId ? await detectCountry(req) : null;
    await db
      .update(e2eeKeys)
      // The public key is immutable, but a legacy private-key backup can be
      // rewrapped with a device-only recovery secret during client upgrade.
      .set({
        encryptedPrivateKey,
        lastUsedAt: new Date(),
        platform,
        ...(requestedName ? { deviceName: requestedName } : {}),
        ...(detectedCountry ? { ipCountry: detectedCountry, ipCountryAt: new Date() } : {}),
      })
      .where(eq(e2eeKeys.id, existing.id));
  } else {
    // Bootstrap only a genuinely new account. An account with lost/revoked
    // keys must explicitly recover; an empty trusted set is not permission.
    // Serialize first registrations so two browsers cannot both bootstrap.
    const detectedCountry = await detectCountry(req);
    await db.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
      const [priorDevice] = await tx.select({ id: e2eeKeys.id }).from(e2eeKeys).where(eq(e2eeKeys.userId, user.id)).limit(1);
      await tx.insert(e2eeKeys).values({
        userId: user.id,
        deviceId,
        publicKey,
        encryptedPrivateKey,
        sessionId,
        trustedAt: priorDevice ? null : new Date(),
        deviceName: requestedName || null,
        platform,
        country: detectedCountry,
        ipCountry: detectedCountry,
        ipCountryAt: detectedCountry ? new Date() : null,
      }).onConflictDoNothing();
    });
  }

  const [registered] = await db.select({ publicKey: e2eeKeys.publicKey, trustedAt: e2eeKeys.trustedAt, sessionId: e2eeKeys.sessionId }).from(e2eeKeys)
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId))).limit(1);
  if (!registered || registered.publicKey !== publicKey) return jsonError(409, "A different encryption key is already registered for this device.");
  if (!existing && registered?.trustedAt) {
    const requests = await db.execute<{ id: string }>(sql`
      select c.id from conversations c join conversation_members p on p.conversation_id=c.id
      where p.user_id=${user.id} and c.type='dm' and c.created_by_id<>${user.id}
        and c.deleted_at is null and c.last_message_at is not null
        and not exists(select 1 from messages m where m.conversation_id=c.id offset 1)
      limit 100`);
    await Promise.all(requests.rows.map(row => publishToConversation(row.id, {
      type: "conversation:encryption-ready", conversationId: row.id, userId: user.id,
    })));
  }
  return NextResponse.json({ success: true, pendingApproval: !registered?.trustedAt, needsSessionBinding: Boolean(sessionId && registered?.sessionId !== sessionId) });
}
