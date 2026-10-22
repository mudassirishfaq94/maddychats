/** Share pending work only. Never cache a settled authorization or response. */
export function createInFlightRead<T>() {
  const pending = new WeakMap<object, Promise<T>>();
  return {
    run(scope: object, load: () => Promise<T>): Promise<T> {
      const previous = pending.get(scope);
      if (previous) return previous;
      const request = Promise.resolve().then(load).then(value => {
        if (pending.get(scope) !== request) throw new Error("Read scope changed");
        return value;
      }).finally(() => { if (pending.get(scope) === request) pending.delete(scope); });
      pending.set(scope, request);
      return request;
    },
    invalidate(scope: object) { pending.delete(scope); },
  };
}
