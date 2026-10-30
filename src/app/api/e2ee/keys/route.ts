import { after, NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys, deviceSessions, users } from "@/db/schema";
import { getSessionUser, getDeviceSetupUser, getSessionAccess, getSessionDeviceId } from "@/server/session";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { isUuid } from "@/server/users";
import { publishToConversation } from "@/server/realtime";
import { rateLimit } from "@/server/rate-limit";
import { detectCountry } from "@/server/country";
import { browserLabel, platformLabel, COUNTRY_NAMES } from "@/server/device-meta";
import { isCurrentPrivateKeyEnvelope } from "@/lib/private-key-envelope";

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

  const user = await getDeviceSetupUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const targetId = req.nextUrl.searchParams.get("userId");
  if (targetId && !(await getSessionUser())) return jsonError(403, "Finish device verification before accessing other users.");
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
  } : { ...key, encryptedPrivateKey: isCurrentPrivateKeyEnvelope(key.encryptedPrivateKey) ? key.encryptedPrivateKey : undefined, backupNeedsUpgrade: !isCurrentPrivateKeyEnvelope(key.encryptedPrivateKey), deviceName: key.deviceName ?? browserLabel(key.browser) ?? key.platform, country: key.country ?? user.country, sessionState: key.sessionRevokedAt ? "revoked" : key.sessionExpiresAt ? (key.sessionExpiresAt.getTime() <= Date.now() ? "expired" : "active") : "unknown" });

  return NextResponse.json({ keys }, { headers: { "Cache-Control": "no-store" } });
}

/** Register a new device key */
export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getDeviceSetupUser();
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
  if (!isCurrentPrivateKeyEnvelope(data.encryptedPrivateKey)) {
    return jsonError(422, "Update Circlo on this device before saving chat access. Existing chat access was not changed.");
  }

  // Optional, display-only identity. A label the user chose wins; otherwise the
  // browser family is derived from the request so the device list is readable.
  const requestedName = typeof data.deviceName === "string" ? data.deviceName.trim().slice(0, MAX_DEVICE_NAME) : "";
  const platform = platformLabel(req.headers.get("user-agent"));
  const sessionId = await getSessionDeviceId();
  // Upsert: update if device already registered, insert otherwise
  const [existing] = await db
    .select({ id: e2eeKeys.id, sessionId: e2eeKeys.sessionId, ipCountryAt: e2eeKeys.ipCountryAt })
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
    // A restricted sign-in may describe its own pending key, never change the
    // name, activity or backup of another browser just by knowing its public ID.
    if (!(await getSessionAccess())?.approvalRequired || existing.sessionId === sessionId) await db
      .update(e2eeKeys)
      // The public key is immutable, but a legacy private-key backup can be
      // rewrapped with a device-only recovery secret during client upgrade.
      .set({
        encryptedPrivateKey: (await getSessionAccess())?.approvalRequired ? undefined : encryptedPrivateKey,
        lastUsedAt: new Date(),
        platform,
        ...(requestedName ? { deviceName: requestedName } : {}),
      })
      .where(eq(e2eeKeys.id, existing.id));
  } else {
    // Bootstrap only a genuinely new account. An account with lost/revoked
    // keys must explicitly recover; an empty trusted set is not permission.
    // Serialize first registrations so two browsers cannot both bootstrap.
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
        country: null,
        ipCountry: null,
        ipCountryAt: null,
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
  // Display-only enrichment must not delay secure-send readiness. Refresh at
  // most daily; authorization and device trust above never depend on GeoIP.
  if (!existing?.ipCountryAt || Date.now() - existing.ipCountryAt.getTime() > 86400000) {
    after(async () => {
      try {
        const country = await detectCountry(req);
        if (!country) return;
        await db.update(e2eeKeys).set({
          ipCountry: country, ipCountryAt: new Date(),
          ...(!existing ? { country: sql`coalesce(${e2eeKeys.country}, ${country})` } : {}),
        }).where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, deviceId), eq(e2eeKeys.publicKey, publicKey)));
      } catch { /* Optional location labels are retried on a later registration. */ }
    });
  }
  return NextResponse.json({ success: true, pendingApproval: !registered?.trustedAt, needsSessionBinding: Boolean(sessionId && (registered?.sessionId !== sessionId || (registered.trustedAt && (await getSessionAccess())?.approvalRequired))) });
}

/** Labels describe this browser; they never grant encryption trust. */
export async function PATCH(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");
  const sessionId = await getSessionDeviceId();
  if (!sessionId) return jsonError(409, "Sign in again.");
  if (!(await rateLimit(`device-label:${user.id}`, 10, 60000)).allowed) return jsonError(429, "Please wait before editing again.");
  const body = await readJson(req);
  if (typeof body?.deviceId !== "string" || typeof body.deviceName !== "string" || body.deviceName.trim().length > 60 ||
      typeof body.country !== "string" || (body.country !== "" && !Object.hasOwn(COUNTRY_NAMES, body.country))) return jsonError(422, "Choose a country and a device name of up to 60 characters.");
  const changed = await db.update(e2eeKeys).set({ deviceName: body.deviceName.trim() || null, country: body.country || null })
    .where(and(eq(e2eeKeys.userId, user.id), eq(e2eeKeys.deviceId, body.deviceId), eq(e2eeKeys.sessionId, sessionId))).returning({ id: e2eeKeys.id });
  if (!changed.length) return jsonError(403, "You can only label the encryption device bound to this browser session.");
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
}
