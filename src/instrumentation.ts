/** Resume persisted jobs and authoritative expiration on each Node server. */
export async function register() {
  // Keep the runtime branch statically recognizable to Next's Edge compiler.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { startStarterMaintenance } = await import("@/server/starter-maintenance");
    startStarterMaintenance();
  }
}
