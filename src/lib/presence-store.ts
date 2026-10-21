import type { PresenceState } from "./types";

const empty: PresenceState = {};

/** Stable snapshots let a chat subscribe to its peer, not everybody's heartbeats. */
export function createPresenceStore() {
  let snapshot = empty;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    update(userId: string, value: PresenceState[string]) {
      const previous = snapshot[userId];
      if (previous?.online === value.online && previous?.lastSeenAt === value.lastSeenAt) return;
      snapshot = { ...snapshot, [userId]: value };
      notify();
    },
    clear() { if (snapshot === empty) return; snapshot = empty; notify(); },
  };
}
