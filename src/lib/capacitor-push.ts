import { isNativeApp } from "@/lib/native-platform";
import { notificationPath } from "@/lib/notification-navigation";

/** Native Capacitor builds use FCM; installed browser PWAs use Web Push. */

/** Detect Capacitor runtime. */
export function isCapacitor(): boolean {
  return isNativeApp();
}

/**
 * Register for native push notifications via Capacitor.
 * Returns the device FCM token, or null if not available.
 */
export async function registerCapacitorPush(): Promise<string | null> {
  if (!isCapacitor()) return null;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Request permission
    let permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      console.warn("[capacitor-push] Notification permission not granted:", permResult.receive);
      return null;
    }

    await PushNotifications.createChannel({ id: "maddychats-messages", name: "Messages", description: "New encrypted messages", importance: 4, vibration: true });
    // Attach before register(): cached tokens can be emitted immediately.
    // Remove only these two handles, never the independent tap listener.
    return await new Promise<string | null>((resolve) => {
      const handles: Array<{ remove: () => Promise<void> }> = [];
      let finished = false;
      const finish = (token: string | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        for (const handle of handles) void handle.remove();
        resolve(token);
      };
      const timeout = setTimeout(() => finish(null), 10_000);
      void (async () => {
        const add = async (handle: Promise<{ remove: () => Promise<void> }>) => {
          const listener = await handle;
          if (finished) await listener.remove(); else handles.push(listener);
        };
        await add(PushNotifications.addListener("registration", token => finish(token.value)));
        await add(PushNotifications.addListener("registrationError", () => finish(null)));
        if (!finished) await PushNotifications.register();
      })().catch(() => finish(null));
    });
  } catch (error) {
    console.error("[capacitor-push] Failed to register:", error);
    return null;
  }
}

/**
 * Send the FCM token to the server so it can store it for push delivery.
 */
export async function sendTokenToServer(token: string): Promise<void> {
  try {
    const response = await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: "android" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Push device registration was rejected.");
  } catch (error) {
    console.error("[capacitor-push] Failed to send token to server:", error);
  }
}

/**
 * Listen for notification taps — navigate to the relevant chat.
 */
export async function setupNotificationTapListener(): Promise<() => void> {
  if (!isCapacitor()) return () => {};
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const listener = await PushNotifications.addListener("pushNotificationActionPerformed", action => {
    const target = notificationPath(action.notification.data?.url, window.location.origin);
    if (target) window.location.assign(target);
  });
  return () => { void listener.remove(); };
}
