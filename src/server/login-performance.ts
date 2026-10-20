import { AsyncLocalStorage } from "node:async_hooks";
import { timingSafeEqual } from "node:crypto";

type Sample = { stages: Record<string, number> };
const state = globalThis as typeof globalThis & { __loginTimings?: AsyncLocalStorage<Sample> };
const samples = state.__loginTimings ??= new AsyncLocalStorage<Sample>();

/** Local opt-in diagnostics only: never log identifiers, credentials or tokens. */
function enabled() {
  if (process.env.LOGIN_PERFORMANCE_DIAGNOSTICS !== "1") return false;
  try { return new URL(process.env.CLIENT_URL ?? "").hostname === "127.0.0.1"; }
  catch { return false; }
}

export async function measureLoginStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const sample = samples.getStore();
  if (!sample) return operation();
  const start = performance.now();
  try { return await operation(); }
  finally { sample.stages[stage] = (sample.stages[stage] ?? 0) + performance.now() - start; }
}

export function recordLoginQueue(milliseconds: number) {
  const sample = samples.getStore();
  if (sample) sample.stages.password_queue = (sample.stages.password_queue ?? 0) + milliseconds;
}

export async function withLoginTimings<T extends Response>(operation: () => Promise<T>, request?: { headers: Headers }): Promise<T> {
  const local = enabled();
  const secret = process.env.HEALTHCHECK_SECRET;
  const expected = secret ? Buffer.from(`Bearer ${secret}`) : null;
  const supplied = Buffer.from(request?.headers.get("authorization") ?? "");
  const authorized = Boolean(expected && expected.length === supplied.length && timingSafeEqual(expected, supplied));
  if (!local && !authorized) return operation();
  return samples.run({ stages: {} }, async () => {
    const start = performance.now();
    let status = 500;
    try {
      const response = await operation(); status = response.status;
      // Private one-off probes only. Ordinary login responses expose no timings.
      if (authorized) {
        const timings = { ...samples.getStore()!.stages, handler_total: performance.now() - start };
        response.headers.set("Server-Timing", Object.entries(timings).map(([stage,ms])=>`${stage};dur=${ms.toFixed(2)}`).join(", "));
      }
      return response;
    }
    finally {
      if (local) console.log("[login-performance] " + JSON.stringify({ status, totalMs: performance.now() - start, stages: samples.getStore()!.stages }));
    }
  });
}
