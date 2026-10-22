import type { UserRow } from "@/db/schema";

/** Snapshot taken when a primary credential or second factor was verified. */
export type SignInState = Pick<UserRow, "id" | "username" | "passwordHash" | "tokenInvalidBeforeAt">;

export class SignInStateError extends Error {
  constructor() { super("Authentication changed. Start sign-in again."); }
}

export function sameSignInState(expected: SignInState, current: SignInState): boolean {
  return expected.id === current.id && expected.passwordHash === current.passwordHash &&
    (expected.tokenInvalidBeforeAt?.getTime() ?? null) === (current.tokenInvalidBeforeAt?.getTime() ?? null);
}

export function accountSuspended(user: Pick<UserRow, "suspendedAt" | "suspendedUntil">, now = Date.now()) {
  return Boolean(user.suspendedAt && (!user.suspendedUntil || user.suspendedUntil.getTime() >= now));
}
