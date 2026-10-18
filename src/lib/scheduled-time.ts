export function scheduledInstant(value: unknown, now = Date.now()): Date | null {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.getTime() > now ? instant : null;
}
