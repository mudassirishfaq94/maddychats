import { createHmac, randomInt } from "node:crypto";
import { jwtSecret } from "./config";

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const LINK_CODE_LENGTH = 6;

/** Uniform six-digit codes, including leading zeros. */
export function generateLinkCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(LINK_CODE_LENGTH, "0");
}

export function normalizeLinkCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\s-]+/g, "");
  return /^\d{6}$/.test(cleaned) ? cleaned : null;
}

/** A leaked database alone cannot brute-force the small numeric code space. */
export function linkCodeHash(code: string): string {
  return createHmac("sha256", jwtSecret()).update("device-link:v2:" + code).digest("hex");
}
