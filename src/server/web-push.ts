import webPush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, fcmTokens } from "@/db/schema";

let configured = false;
let firebaseAdmin: any = null;

function configureWebPush(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Lazily initialize Firebase Admin for FCM delivery.
 * Returns null if not configured (missing GOOGLE_APPLICATION_CREDENTIALS).
 */
async function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin: any = await import("firebase-admin");

    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (!projectId || !clientEmail || !privateKey) {
        console.warn("[push] Firebase Admin not configured — FCM delivery disabled.");
        return null;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      });
    }

    firebaseAdmin = admin;
    return firebaseAdmin;
  } catch (error) {
    console.error("[push] Firebase Admin init failed:", error);
    return null;
  }
}

/**
 * Send a native push notification through Firebase Cloud Messaging.
 * Used for Android devices where VAPID web push doesn't fire OS notifications.
 */
async function sendFCM(
  tokens: { token: string; platform: string }[],
  payload: { title: string; body: string; url: string; tag: string },
): Promise<void> {
  const admin = await getFirebaseAdmin();
  if (!admin) return;

  const messaging = admin.messaging?.() ?? (admin as any).messaging;

  await Promise.all(
    tokens.map(async ({ token }) => {
      try {
        await messaging.send({
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            url: payload.url,
            tag: payload.tag,
          },
          android: {
            priority: "high",
            notification: {
              channelId: "maddychats-messages",
              tag: payload.tag,
              clickAction: "OPEN_ACTIVITY_1",
            },
          },
          webpush: {
            headers: { TTL: "86400" },
          },
        });
      } catch (error: any) {
        const code = error?.code || "";
        // Token is invalid or unregistered — remove it
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await db.delete(fcmTokens).where(eq(fcmTokens.token, token));
        } else {
          console.error("[push] FCM delivery failed:", code);
        }
      }
    }),
  );
}

/**
 * Send push notification to a user through both channels:
 * 1. FCM (Android native — fires OS tray notification even when app is backgrounded)
 * 2. VAPID web push (browser — fires in-browser notification)
 *
 * Both are sent in parallel; the one that reaches the device first wins.
 */
export async function sendMessagePush(
  userId: string,
  payload: {
    actorName: string;
    preview: string;
    conversationId: string;
    messageId: string;
  },
): Promise<void> {
  const notificationPayload = {
    title: payload.actorName,
    body: payload.preview,
    url: `/app/chats/${payload.conversationId}?latest=1`,
    tag: `message-${payload.messageId}`,
  };

  // 1. Send through FCM for Android devices
  const fcmDevices = await db
    .select({ token: fcmTokens.token, platform: fcmTokens.platform })
    .from(fcmTokens)
    .where(eq(fcmTokens.userId, userId));

  if (fcmDevices.length > 0) {
    sendFCM(fcmDevices, notificationPayload).catch((err) =>
      console.error("[push] FCM batch error:", err),
    );
  }

  // 2. Send through VAPID web push for browser
  if (!configureWebPush()) return;

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(notificationPayload),
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
  );
}
