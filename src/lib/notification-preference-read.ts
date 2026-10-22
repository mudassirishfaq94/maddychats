import { createInFlightRead } from "./in-flight-read";

export interface NotificationSettings {
  messageNotifications: boolean;
  groupNotifications: boolean;
  pushNotifications: boolean;
  notificationSound: boolean;
  showNotificationDetails: boolean;
}
const reads = createInFlightRead<NotificationSettings | null>();

/** An opaque auth-provider scope changes on account/session transitions.
 * Consumers ignore their own unmounted results; they never abort a shared read. */
export function readNotificationPreferences(scope: object) {
  return reads.run(scope, async () => {
    const response = await fetch("/api/notifications/preferences", { cache: "no-store", signal: AbortSignal.timeout(10000) });
    return response.ok ? (await response.json() as { preferences?: NotificationSettings }).preferences ?? null : null;
  });
}
export function invalidateNotificationPreferences(scope: object) { reads.invalidate(scope); }
