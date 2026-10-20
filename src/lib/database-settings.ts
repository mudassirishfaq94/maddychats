/** Bound deployment-controlled connection capacity; invalid input fails to a safe default. */
export function databasePoolMax(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, 20) : 5;
}
