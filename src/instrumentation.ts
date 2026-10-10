/** Resume persisted scheduled jobs when a Node server wakes or restarts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SCHEDULED_MESSAGES_ENABLED === "1") {
    const { startStarterMaintenance } = await import("@/server/starter-maintenance");
    startStarterMaintenance();
  }
}
