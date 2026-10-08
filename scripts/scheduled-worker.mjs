import { writeFile, readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const heartbeat = process.env.WORKER_HEARTBEAT_FILE || "/tmp/scheduled-worker-heartbeat";
const interval = Number(process.env.SCHEDULED_INTERVAL_MS || 15000);
if (!Number.isInteger(interval) || interval < 1000 || interval > 300000) {
  throw new Error("SCHEDULED_INTERVAL_MS must be between 1000 and 300000");
}
if (process.argv.includes("--healthcheck")) {
  try {
    const lastSuccess = Number(await readFile(heartbeat, "utf8"));
    if (!lastSuccess || Date.now() - lastSuccess > Math.max(120000, interval * 4)) {
      throw new Error("stale heartbeat");
    }
  } catch {
    process.exitCode = 1;
  }
} else {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is required for the scheduled worker");
  const origin = new URL(process.env.SCHEDULED_BASE_URL || "http://web:3000");
  if (origin.username || origin.password || !["http:", "https:"].includes(origin.protocol)) {
    throw new Error("Invalid SCHEDULED_BASE_URL");
  }
  const controller = new AbortController();
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => controller.abort());
  }
  while (!controller.signal.aborted) {
    try {
      const response = await fetch(new URL("/api/cron/process-scheduled", origin), {
        redirect: "error",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      });
      if (!response.ok) throw new Error("request failed");
      const result = await response.json();
      if (result.success !== true || result.failed !== 0) throw new Error("processing failed");
      await writeFile(heartbeat, String(Date.now()), { mode: 0o600 });
      if (result.processed) console.log(`Scheduled messages processed: ${result.processed}`);
    } catch {
      if (!controller.signal.aborted) console.error("Scheduled processing failed; retrying next interval");
    }
    await sleep(interval, undefined, { signal: controller.signal }).catch(() => undefined);
  }
}
