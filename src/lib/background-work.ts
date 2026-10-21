/** Delay optional initialization until the browser has room; never gate keys or rendering. */
export function waitForBackgroundSlot(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    let cancel: () => void;
    const done = () => { signal.removeEventListener("abort", abort); resolve(); };
    const abort = () => { cancel(); reject(signal.reason); };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(done, { timeout: 3000 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = setTimeout(done, 750);
      cancel = () => clearTimeout(id);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
