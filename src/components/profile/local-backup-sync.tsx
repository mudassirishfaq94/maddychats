"use client";
import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
const BACKUP_DAY = 86_400_000;

/** Daily, opt-in local work. Never runs on the send/typing or first-paint path. */
export function LocalBackupSync() {
  const { user } = useAuth(); const { initialized, deviceId, decrypt, waitForDeviceRegistration } = useSharedE2EE();
  useEffect(() => {
    if (!user || !initialized) return;
    const controller = new AbortController(); let running = false, failedAt = 0;
    const refresh = async () => {
      if (running || controller.signal.aborted || document.visibilityState !== "visible" || !navigator.onLine || Date.now() - failedAt < 6 * 60 * 60 * 1000) return;
      running = true;
      try {
        // A nonsecret hint avoids loading archive/crypto code for accounts
        // which have never opted in. IndexedDB remains the actual setting.
        if (localStorage.getItem(`circlo:local-backup-enabled:${user.id}`) !== "1") return;
        const { readBackupRecord, refreshLocalBackup, patchBackupSettings } = await import("@/lib/local-chat-backup-store");
        const settings = await readBackupRecord(user.id, "settings");
        if (!settings?.enabled || (settings.savedAt && Date.now() - Date.parse(settings.savedAt) < BACKUP_DAY) || (settings.failedAt && Date.now() - settings.failedAt < 6 * 60 * 60 * 1000)) return;
        try { await waitForDeviceRegistration(); controller.signal.throwIfAborted(); await refreshLocalBackup({ userId: user.id, deviceId, signal: controller.signal, decrypt }); }
        catch { if (!controller.signal.aborted) { failedAt = Date.now(); await patchBackupSettings(user.id, { failedAt, error: "Daily backup could not finish. Open backup settings to retry. Your previous backup is safe." }); } }
      } catch { /* Storage may be unavailable; the explicit setup UI reports it. */ }
      finally { running = false; }
    };
    const timer = setTimeout(() => void refresh(), 15000);
    const interval = setInterval(() => void refresh(), 60 * 60 * 1000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible); window.addEventListener("online", visible);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(interval); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, [user, initialized, deviceId, decrypt, waitForDeviceRegistration]);
  return null;
}
