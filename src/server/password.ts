import bcrypt from "bcryptjs";

/**
 * bcrypt password hashing. bcrypt internally truncates at 72 bytes; the
 * validation schema enforces that limit so behaviour stays predictable.
 */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}
