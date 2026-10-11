/** Bound CPU work and reserve a libuv slot when more than one is available. */
export function passwordConcurrency(configured?: string, threadpool?: string) {
  const requested = Number(configured ?? 2);
  const workers = Number(threadpool ?? 4);
  const limit = Number.isInteger(requested) && requested >= 1 && requested <= 3 ? requested : 2;
  const available = Number.isInteger(workers) && workers >= 1 && workers <= 1024 ? workers : 4;
  return Math.min(limit, Math.max(1, available - 1));
}
