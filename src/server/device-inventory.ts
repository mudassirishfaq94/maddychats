import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { deviceLinkRequests, deviceSessions, e2eeKeys } from "@/db/schema";
import { browserLabel, countryFlag, countryName, platformLabel } from "./device-meta";

/** A browser session that is currently signed in and still valid. */
export type DeviceSessionSummary = {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
};

/**
 * One row per registered encryption device. Trust is read from the device row
 * itself (`deviceId` + `trustedAt`), never inferred from whichever browser
 * session happens to be current, so signing in again does not undo an approval.
 */
export type DeviceInventoryRow = {
  deviceId: string;
  label: string;
  platform: string;
  trusted: boolean;
  trustedAt: string | null;
  createdAt: string;
  lastUsedAt: string;
  country: string | null;
  countryName: string;
  countryFlag: string;
  /** Country we observed from the network, which may differ from a typed one. */
  ipCountry: string | null;
  ipCountryAt: string | null;
  fingerprint: string;
  pendingLinkExpiresAt: string | null;
  sessions: DeviceSessionSummary[];
};

export function publicKeyFingerprint(publicKey: string): string {
  return createHash("sha256").update(publicKey).digest("hex");
}

export type DeviceInventory = {
  devices: DeviceInventoryRow[];
  /**
   * Signed-in sessions whose browser has not bound an encryption key to them
   * yet. They are shown separately instead of disappearing from the list, so the
   * browser being used is always accounted for.
   */
  unboundSessions: DeviceSessionSummary[];
};

export async function deviceInventory(userId: string, currentSessionId: string | null): Promise<DeviceInventory> {
  const keys = await db
    .select({
      deviceId: e2eeKeys.deviceId,
      trustedAt: e2eeKeys.trustedAt,
      createdAt: e2eeKeys.createdAt,
      lastUsedAt: e2eeKeys.lastUsedAt,
      deviceName: e2eeKeys.deviceName,
      country: e2eeKeys.country,
      platform: e2eeKeys.platform,
      publicKey: e2eeKeys.publicKey,
      sessionId: e2eeKeys.sessionId,
      ipCountry: e2eeKeys.ipCountry,
      ipCountryAt: e2eeKeys.ipCountryAt,
    })
    .from(e2eeKeys)
    .where(eq(e2eeKeys.userId, userId))
    .orderBy(e2eeKeys.createdAt);

  const now = new Date();
  const pending = await db
    .select({ id: deviceLinkRequests.id, deviceId: deviceLinkRequests.deviceId, expiresAt: deviceLinkRequests.expiresAt, status: deviceLinkRequests.status })
    .from(deviceLinkRequests)
    .where(and(eq(deviceLinkRequests.userId, userId), eq(deviceLinkRequests.status, "pending"), gt(deviceLinkRequests.expiresAt, now)));
  const pendingByDevice = new Map(pending.map((row) => [row.deviceId, row.expiresAt]));

  // Every live session is considered, not only the ones a device points at, so
  // a browser that has signed in but not linked its key is still visible. A
  // device whose session was revoked or has expired keeps an empty session
  // list, which shows that its trust state is stale.
  const sessions = await db
    .select({ id: deviceSessions.id, userAgent: deviceSessions.userAgent, createdAt: deviceSessions.createdAt, lastSeenAt: deviceSessions.lastSeenAt, expiresAt: deviceSessions.expiresAt })
    .from(deviceSessions)
    .where(and(eq(deviceSessions.userId, userId), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, now)))
    .orderBy(desc(deviceSessions.lastSeenAt))
    .limit(100);
  const summarize = (session: (typeof sessions)[number]): DeviceSessionSummary => ({
    id: session.id,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt ? session.lastSeenAt.toISOString() : null,
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentSessionId,
  });

  const sessionToDevice = new Map<string, string>();
  for (const key of keys) {
    if (key.sessionId && !sessionToDevice.has(key.sessionId)) sessionToDevice.set(key.sessionId, key.deviceId);
  }
  const sessionsByDevice = new Map<string, DeviceSessionSummary[]>();
  const unboundSessions: DeviceSessionSummary[] = [];
  for (const session of sessions) {
    const owner = sessionToDevice.get(session.id);
    if (!owner) {
      unboundSessions.push(summarize(session));
      continue;
    }
    const list = sessionsByDevice.get(owner) ?? [];
    // A device can only be pointed at by one row, so this appends at most one.
    list.push(summarize(session));
    sessionsByDevice.set(owner, list);
  }

  const devices = keys.map((key) => {
    const liveSessions = sessionsByDevice.get(key.deviceId) ?? [];
    // Older rows predate platform capture, so fall back to the browser that
    // registered them before giving up and reporting an unknown device.
    const platform = key.platform || platformLabel(liveSessions[0]?.userAgent);
    return {
      deviceId: key.deviceId,
      label: key.deviceName ?? browserLabel(liveSessions[0]?.userAgent) ?? platform,
      platform,
      trusted: Boolean(key.trustedAt),
      trustedAt: key.trustedAt ? key.trustedAt.toISOString() : null,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: (key.lastUsedAt ?? key.createdAt).toISOString(),
      country: key.country,
      countryName: countryName(key.country),
      countryFlag: countryFlag(key.country),
      ipCountry: key.ipCountry,
      ipCountryAt: key.ipCountryAt ? key.ipCountryAt.toISOString() : null,
      fingerprint: publicKeyFingerprint(key.publicKey),
      pendingLinkExpiresAt: pendingByDevice.get(key.deviceId)?.toISOString() ?? null,
      sessions: liveSessions,
    };
  });

  return { devices, unboundSessions };
}
