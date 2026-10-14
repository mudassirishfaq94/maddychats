import bcrypt from "bcrypt";
import { measureLoginStage, recordLoginQueue } from "./login-performance";
import { passwordConcurrency } from "./password-concurrency";

// Native async bcrypt runs in libuv workers, never on the request event loop.
// Leave two of the default four workers available for other server work.
const state = globalThis as typeof globalThis & {
  __passwordWork?: { active: number; waiting: (() => void)[] };
};
const work = state.__passwordWork ??= { active: 0, waiting: [] };
// Bounded tuning; keep at least one libuv worker available for filesystem/DNS.
const capacity = passwordConcurrency(process.env.PASSWORD_CONCURRENCY, process.env.UV_THREADPOOL_SIZE);
export class PasswordBusyError extends Error {
  constructor() { super("Password verification is busy. Please retry shortly."); }
}
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  const start = performance.now();
  if (work.active >= capacity) {
    if (work.waiting.length >= 4) throw new PasswordBusyError();
    await new Promise<void>((resolve, reject) => {
      const ready = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = work.waiting.indexOf(ready);
        if (index >= 0) work.waiting.splice(index, 1);
        reject(new PasswordBusyError());
      }, 1000);
      work.waiting.push(ready);
    });
  } else work.active++;
  recordLoginQueue(performance.now() - start);
  try { return await measureLoginStage("password_work", operation); }
  finally {
    const next = work.waiting.shift();
    if (next) next(); // Transfer the occupied slot directly to the waiter.
    else work.active--;
  }
}

/**
 * bcrypt password hashing. bcrypt internally truncates at 72 bytes; the
 * validation schema enforces that limit so behaviour stays predictable.
 */
const BCRYPT_ROUNDS = 12;

/** Public dummy hash for unknown-account timing parity; never an account credential. */
export const DUMMY_PASSWORD_HASH = "$2b$12$mvEOPCGRUthBxDB9aqUo1ufDfG06OmmbhcY7lRFpEP.oteY1dbIy.";

export async function hashPassword(plaintext: string): Promise<string> {
  if (Buffer.byteLength(plaintext, "utf8") > 72) throw new Error("Password exceeds bcrypt's 72-byte limit.");
  return bounded(() => bcrypt.hash(plaintext, BCRYPT_ROUNDS));
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  // bcrypt otherwise accepts any suffix after byte 72 of a valid password.
  if (Buffer.byteLength(plaintext, "utf8") > 72) return false;
  try {
    return await bounded(() => bcrypt.compare(plaintext, hash));
  } catch (error) {
    if (error instanceof PasswordBusyError) throw error;
    return false;
  }
}
