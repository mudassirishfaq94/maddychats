import { cleanupExpiredCalls } from "./call-push";
import { cleanupExpiredMessages } from "./message-lifetime";
import { cleanupRealtimeEvents } from "./realtime";
import { cleanupUploads } from "./upload-retention";
import { cleanupRateLimits } from "./rate-limit";
import { cleanupExpiredAuthentication } from "./auth-maintenance";

import { processScheduledMessages } from "./scheduled-messages";
import { db } from "@/db";
import { deviceLinkRequests } from "@/db/schema";
import { lt } from "drizzle-orm";

const state = globalThis as typeof globalThis & {
  __messageExpiryMaintenance?: ReturnType<typeof setInterval>;
  __scheduledMaintenance?: ReturnType<typeof setInterval>;
  __starterMaintenance?: ReturnType<typeof setInterval>;
};

/** Existing processors share their database lock; the free host catches up after waking. */
export function startStarterMaintenance() {
  if (!state.__messageExpiryMaintenance) {
    let expiring = false;
    const expire = async () => { if (expiring) return; expiring = true;
      try { await cleanupExpiredMessages(); await cleanupExpiredCalls(); } catch { console.error("[expiry] Cleanup unavailable; retrying."); } finally { expiring = false; }
    };
    state.__messageExpiryMaintenance = setInterval(() => { void expire(); }, 5000);
    state.__messageExpiryMaintenance.unref(); void expire();
  }
  if ((process.env.STARTER_MODE !== "1" || process.env.SCHEDULED_MESSAGES_ENABLED === "1") && !state.__scheduledMaintenance) {
    let processing = false;
    const deliver = async () => {
      if (processing) return;
      processing = true;
      try { await processScheduledMessages(); }
      catch { console.error("[scheduled] Delivery unavailable; retrying later."); }
      finally { processing = false; }
    };
    state.__scheduledMaintenance = setInterval(() => { void deliver(); }, 10000);
    state.__scheduledMaintenance.unref(); void deliver();
  }
  if (state.__starterMaintenance) return;
  let running = false;
  const clean = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupExpiredAuthentication();

      await cleanupRealtimeEvents();
      await cleanupRateLimits();
      await cleanupUploads();
      await db.delete(deviceLinkRequests).where(lt(deviceLinkRequests.expiresAt, new Date(Date.now() - 86400000)));
    } catch { console.error("[maintenance] Cleanup unavailable; retrying later."); }
    finally { running = false; }
  };
  state.__starterMaintenance = setInterval(() => { void clean(); }, 15 * 60 * 1000);
  state.__starterMaintenance.unref();
  void clean();
}
