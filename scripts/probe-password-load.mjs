/** Local CPU diagnostic only; does not start the app or call any HTTP endpoint. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import bcrypt from 'bcrypt';

const password = randomBytes(24).toString('base64url');
const hash = await bcrypt.hash(password, 12);
async function sample(concurrency) {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  await new Promise(r => setTimeout(r, 50));
  delay.reset();
  const started = performance.now();
  const durations = await Promise.all(Array.from({ length: concurrency }, async () => {
    const start = performance.now();
    assert.equal(await bcrypt.compare(password, hash), true);
    return performance.now() - start;
  }));
  const elapsedMs = performance.now() - started;
  await new Promise(r => setTimeout(r, 20));
  const result = { concurrency, elapsedMs, comparisonDurationsMs: durations, eventLoopP95Ms: delay.percentile(95) / 1e6, eventLoopMaxMs: delay.max / 1e6 };
  delay.disable();
  return result;
}
const result = { timestamp: new Date().toISOString(), package: 'bcrypt', cost: 12,
  description: 'Native async compare diagnostic, isolated local process. The app additionally bounds work to two active and four waiting operations; cost remains 12.',
  samples: [await sample(1), await sample(1), await sample(1), await sample(5)],
};
await mkdir('docs/performance', { recursive: true });
await writeFile('docs/performance/k6-password-probe.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
