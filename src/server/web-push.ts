import { deliverNativePush } from "@/lib/native-push-delivery";
import { nativePushPayload } from "@/lib/native-push-payload";
import { safeError } from "@/server/safe-error";
import webPush from "web-push";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, fcmTokens, deviceSessions } from "@/db/schema";
import { pushConfiguration } from "./push-configuration";
import { isSupportedPushEndpoint } from "@/lib/push-endpoint";

let configured = false;
let firebaseMessaging: import("firebase-admin/messaging").Messaging | null = null;

function configureWebPush(): boolean {
  if (configured) return true;
  const configuration = pushConfiguration();
  if (!configuration) return false;
  const { publicKey, privateKey, subject } = configuration;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Lazily initialize Firebase Admin for FCM delivery.
 * Returns null if the server-only Firebase project/email/private-key settings are missing.
 */
async function getFirebaseMessaging() {
  if (firebaseMessaging) return firebaseMessaging;
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
      console.warn("[push] Firebase Admin not configured — FCM delivery disabled.");
      return null;
    }
    const { nativeFirebaseMessaging } = await import("./native-firebase");
    firebaseMessaging = nativeFirebaseMessaging({ projectId, clientEmail, privateKey });
    return firebaseMessaging;
  } catch (error) {
    console.error("[push] Firebase Admin init failed:", safeError(error));
    return null;
  }
}

/**
 * Send a native push notification through Firebase Cloud Messaging.
 * Used for Android devices where VAPID web push doesn't fire OS notifications.
 */
async function sendFCM(
  tokens: { token: string; platform: string }[],
  payload: ReturnType<typeof nativePushPayload>,
): Promise<void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  await deliverNativePush(tokens, payload,
    message => messaging.send(message),
    async token => { await db.delete(fcmTokens).where(eq(fcmTokens.token, token)); },
    code => console.error("[push] FCM delivery failed:", code),
  );
}

/**
 * Send push notification to a user through both channels:
 * 1. FCM (Android native — fires OS tray notification even when app is backgrounded)
 * 2. VAPID web push (browser — fires in-browser notification)
 *
 * Separate installations receive their own channel; the hosted WebView never subscribes to Web Push.
 */
export async function sendMessagePush(
  userId: string,
  payload: {
    messageRequest?: boolean;
    silent?: boolean;
    callId?: string;
    callTtl?: number;
    webOnly?: boolean;
    notificationId: string;
    actorName: string;
    preview: string;
    showDetails?: boolean;
    isGroup?: boolean;
    groupName?: string | null;
    encrypted?: boolean;
    /** Ready-to-display alert text; resolved by the caller. */
    title?: string;
    body?: string;
    conversationId: string;
    messageId: string;
  },
): Promise<void> {
  // 1. Send through FCM for Android devices
  const fcmDevices = await db
    .select({ token: fcmTokens.token, platform: fcmTokens.platform })
    .from(fcmTokens)
    .innerJoin(deviceSessions, and(eq(deviceSessions.id, fcmTokens.sessionId), eq(deviceSessions.userId, fcmTokens.userId)))
    .where(and(eq(fcmTokens.userId, userId), eq(fcmTokens.platform, "android-webview-v1"), isNull(deviceSessions.revokedAt), gt(deviceSessions.expiresAt, new Date()), eq(deviceSessions.approvalRequired, false)));

  // Kept within the caller's existing after() lifecycle; SSE/HTTP delivery does
  // not wait on the provider. Do not abandon an untracked background promise.
  const nativeDelivery = fcmDevices.length > 0 && !payload.webOnly
    ? sendFCM(fcmDevices, nativePushPayload({ ...payload, recipientId: userId })).catch(err => console.error("[push] FCM batch error:", safeError(err)))
    : Promise.resolve();

  // 2. Send through VAPID web push for browser
  if (!configureWebPush()) { await nativeDelivery; return; }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  await Promise.all([nativeDelivery, ...
    subscriptions.map(async (subscription) => {
      if (!isSupportedPushEndpoint(subscription.endpoint)) return;
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          // Resolve presentation through the current authenticated session in
          // the worker. Queued pushes cannot reveal a previous account's name.
          JSON.stringify({ notificationId: payload.notificationId, recipientId: userId, ...(payload.callId ? { callId: payload.callId } : {}) }),
          { timeout: 10000, TTL: payload.callTtl ?? 3600, urgency: "high" },
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
        } else {
          console.error("[push] Web Push delivery failed", { statusCode });
        }
      }
    }),
  ]);
}
