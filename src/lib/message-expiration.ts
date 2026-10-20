export const SELF_DESTRUCT_MS = 5000;
export function messageExpired(message: { expiresAt?: string | Date | null }, now = Date.now()): boolean {
  return Boolean(message.expiresAt && new Date(message.expiresAt).getTime() <= now);
}
export function selfDestructDeadline(revealedAt: Date): Date { return new Date(revealedAt.getTime() + SELF_DESTRUCT_MS); }
