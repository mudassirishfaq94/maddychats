/** An event during a read needs one post-event read, never overlapping reads.
 * Callers may debounce invalidations. Settled responses are not cached here. */
export function createReconciledRead<T>(load: () => Promise<T>, accept: (value: T) => void) {
  let revision = 0, stopped = false;
  let pending: { revision: number; promise: Promise<T> } | undefined;
  const refresh = (): Promise<T> => {
    if (stopped) return Promise.reject(new Error("Read stopped"));
    if (pending) {
      if (pending.revision === revision) return pending.promise;
      return pending.promise.catch(() => undefined).then(refresh);
    }
    const version = revision;
    const promise = Promise.resolve().then(load).then(value => {
      if (stopped) throw new Error("Read stopped");
      if (version === revision) accept(value);
      return value;
    }).finally(() => { if (pending?.promise === promise) pending = undefined; });
    pending = { revision: version, promise };
    return promise;
  };
  return {
    refresh,
    get pending() { return pending?.promise; },
    get pendingIsCurrent() { return pending?.revision === revision; },
    invalidate: () => { revision++; },
    start: () => { stopped = false; },
    stop: () => { stopped = true; revision++; },
  };
}
