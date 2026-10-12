/** Resume persisted scheduled jobs when a Node server wakes or restarts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startStarterMaintenance } = await import("@/server/starter-maintenance");
  startStarterMaintenance();
}
