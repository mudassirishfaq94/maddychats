import bcrypt from "bcrypt";

// Native async bcrypt runs in libuv workers, never on the request event loop.
// Leave two of the default four workers available for other server work.
const state = globalThis as typeof globalThis & {
  __passwordWork?: { active: number; waiting: (() => void)[] };
};
const work = state.__passwordWork ??= { active: 0, waiting: [] };
export class PasswordBusyError extends Error {
  constructor() { super("Password verification is busy. Please retry shortly."); }
}
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  if (work.active >= 2) {
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
  try { return await operation(); }
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

export async function hashPassword(plaintext: string): Promise<string> {
  return bounded(() => bcrypt.hash(plaintext, BCRYPT_ROUNDS));
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bounded(() => bcrypt.compare(plaintext, hash));
  } catch (error) {
    if (error instanceof PasswordBusyError) throw error;
    return false;
  }
}
