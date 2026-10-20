import { timingSafeEqual } from "node:crypto";

/** Compare two strings without leaking which bytes differed. */
export function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Authorization: Bearer <secret> compared in constant time when lengths match. */
export function matchesBearer(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(authorization ?? "");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
