/** A bounded FIFO queue. Cancelled queued work never starts. */
export function createMediaWorkQueue(limit = 2) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid media concurrency");
  let running = 0;
  const waiting: Array<() => void> = [];
  const pump = () => { while (running < limit && waiting.length) waiting.shift()!(); };
  return {
    run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const abort = () => {
          const index = waiting.indexOf(start);
          if (index >= 0) waiting.splice(index, 1);
          reject(signal.reason ?? new Error("Media request cancelled"));
        };
        const start = () => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) { abort(); return; }
          running++;
          void Promise.resolve().then(work).then(resolve, reject).finally(() => { running--; pump(); });
        };
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        waiting.push(start);
        pump();
      });
    },
  };
}
