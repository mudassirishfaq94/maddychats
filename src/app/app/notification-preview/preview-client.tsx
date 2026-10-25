"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { finishLocalNotificationPreview, showLocalNotification } from "@/lib/native-push-bridge";
import { resolveLocalNotification } from "@/lib/local-notification-preview";

/** Minimal device-only decryption surface used by the native background WebView. */
export function NotificationPreviewClient({ notificationId }: { notificationId: string }) {
  const { status, user } = useAuth();
  const { initialized, decrypt } = useSharedE2EE();

  useEffect(() => {
    if (!notificationId) return;
    let active = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      void finishLocalNotificationPreview(notificationId).catch(() => undefined);
    };
    if (status === "unauthenticated" || (status === "authenticated" && !user)) {
      finish();
      return () => { active = false; };
    }
    if (status !== "authenticated" || !user || !initialized) return () => { active = false; };

    void resolveLocalNotification(notificationId, user.id, decrypt, () => active)
      .then(async detail => {
        if (active && detail?.messagePreview) {
          await showLocalNotification({ ...detail, recipientId: user.id, notificationId });
        }
      })
      .catch(() => undefined)
      .finally(finish);
    return () => { active = false; };
  }, [notificationId, status, user, initialized, decrypt]);

  return <main aria-live="polite" className="min-h-screen bg-[var(--background)]" />;
}
