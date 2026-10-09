import { cleanupRealtimeEvents } from "./realtime";
import { cleanupRateLimits } from "./rate-limit";

const state = globalThis as typeof globalThis & {
  __starterMaintenance?: ReturnType<typeof setInterval>;
};

/** Bounded housekeeping while the free app is awake; never sends queued messages. */
export function startStarterMaintenance() {
  if (process.env.STARTER_MODE !== "1" || state.__starterMaintenance) return;
  let running = false;
  const clean = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupRealtimeEvents();
      await cleanupRateLimits();
    } catch { console.error("[maintenance] Cleanup unavailable; retrying later."); }
    finally { running = false; }
  };
  state.__starterMaintenance = setInterval(() => { void clean(); }, 15 * 60 * 1000);
  state.__starterMaintenance.unref();
  void clean();
}
