import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import type { NotificationPreferencesInput } from "@/lib/schemas";

export interface NotificationPreferencesDTO {
  messageNotifications: boolean;
  groupNotifications: boolean;
  pushNotifications: boolean;
  notificationSound: boolean;
}

const defaults: NotificationPreferencesDTO = {
  messageNotifications: true,
  groupNotifications: true,
  pushNotifications: true,
  notificationSound: true,
};

function toDTO(row: typeof notificationPreferences.$inferSelect): NotificationPreferencesDTO {
  return {
    messageNotifications: row.messageNotifications,
    groupNotifications: row.groupNotifications,
    pushNotifications: row.pushNotifications,
    notificationSound: row.notificationSound,
  };
}

/** Creates the default row lazily so existing accounts migrate without backfills. */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferencesDTO> {
  const existing = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (existing[0]) return toDTO(existing[0]);

  const inserted = await db
    .insert(notificationPreferences)
    .values({ userId, ...defaults })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return toDTO(inserted[0]);

  const raced = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return raced[0] ? toDTO(raced[0]) : defaults;
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
): Promise<NotificationPreferencesDTO> {
  await getNotificationPreferences(userId);
  const rows = await db
    .update(notificationPreferences)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, userId))
    .returning();
  return toDTO(rows[0]);
}
