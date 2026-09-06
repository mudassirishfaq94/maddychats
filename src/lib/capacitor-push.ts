/**
 * Capacitor Push Notifications — Android native push via FCM.
 *
 * On Android, web-push (VAPID) doesn't fire system notifications when the app
 * is in the background.  Capacitor's PushNotifications plugin uses FCM which
 * delivers notifications through the OS notification tray, exactly like a
 * native Android app.
 *
 * This module registers for push on Capacitor, sends the device token to the
 * server, and falls back to VAPID web push if not on Capacitor.
 */

/** Detect Capacitor runtime. */
export function isCapacitor(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      // @ts-expect-error — injected by Capacitor at runtime
      typeof window.Capacitor !== "undefined"
    );
  } catch {
    return false;
  }
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

    // Register for push
    await PushNotifications.register();

    // Wait for registration token
    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        PushNotifications.removeAllListeners();
        resolve(null);
      }, 10_000);

      PushNotifications.addListener("registration", (token) => {
        clearTimeout(timeout);
        PushNotifications.removeAllListeners();
        console.log("[capacitor-push] FCM token:", token.value.slice(0, 20) + "...");
        resolve(token.value);
      });

      PushNotifications.addListener("registrationError", (error) => {
        clearTimeout(timeout);
        PushNotifications.removeAllListeners();
        console.error("[capacitor-push] Registration failed:", error);
        resolve(null);
      });
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
    await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: "android" }),
    });
  } catch (error) {
    console.error("[capacitor-push] Failed to send token to server:", error);
  }
}

/**
 * Listen for notification taps — navigate to the relevant chat.
 */
export function setupNotificationTapListener(): void {
  if (!isCapacitor()) return;

  import("@capacitor/push-notifications").then(({ PushNotifications }) => {
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("[capacitor-push] Notification received:", notification.title);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action as any).notification?.data?.url;
      if (url && typeof window !== "undefined") {
        window.location.href = url;
      }
    });
  });
}
