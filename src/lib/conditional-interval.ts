/** An idle or hidden feature owns no interval. Call refresh after its eligibility changes. */
export function createConditionalInterval(
  eligible: () => boolean, run: () => void, milliseconds: number,
  timers: { start: (run: () => void, milliseconds: number) => ReturnType<typeof setInterval>; stop: (id: ReturnType<typeof setInterval>) => void } = {
    start: (run, milliseconds) => setInterval(run, milliseconds), stop: id => clearInterval(id),
  },
) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (timer !== null) timers.stop(timer); timer = null; };
  const refresh = () => {
    if (!eligible()) { stop(); return; }
    if (timer === null) timer = timers.start(() => { if (eligible()) run(); else stop(); }, milliseconds);
  };
  return { refresh, stop };
}
