import { createHash, randomInt } from "node:crypto";

/** How long a code generated on a trusted device stays usable. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
export const LINK_CODE_LENGTH = 8;

/**
 * Crockford-style alphabet: no I, L, O or U, so 0/O and 1/I/L cannot be
 * confused when a person reads the code from one screen and types it on
 * another. Random selection uses randomInt, so each character is uniform.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateLinkCode(): string {
  let code = "";
  for (let index = 0; index < LINK_CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Accept only the format we issue. Callers may paste with spaces or dashes and
 * in lower case, and the ambiguous characters we never emit are folded onto
 * their unambiguous neighbours so a misread code still succeeds once.
 */
export function normalizeLinkCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== LINK_CODE_LENGTH) return null;
  for (const character of cleaned) {
    if (!ALPHABET.includes(character)) return null;
  }
  return cleaned;
}

export function linkCodeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
