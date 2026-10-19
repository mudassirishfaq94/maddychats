// Coordinate the mounted chat and app-wide outbox within this browser tab.
// Server client-message IDs remain authoritative across tabs/devices/restarts.
const claims = new Map<string, symbol>();
export function claimQueuedSend(userId: string, messageId: string): (() => void) | null {
  const key = `${userId}:${messageId}`;
  if (claims.has(key)) return null;
  const token = Symbol();
  claims.set(key, token);
  return () => { if (claims.get(key) === token) claims.delete(key); };
}
