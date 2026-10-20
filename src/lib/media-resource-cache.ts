import { createMediaWorkQueue } from "./media-work-queue";

type Entry = { id: string; url: string; bytes: number; readers: number; touched: number };
type Pending = { id: string; readers: number; controller: AbortController; promise: Promise<Entry>; entry?: Entry };
/** Account-scoped by caller key. Only unreferenced URLs may be evicted. */
export function createMediaResourceCache(options: {
  create: (blob: Blob) => string; revoke: (url: string) => void;
  maxBytes?: number; maxEntries?: number; concurrency?: number;
}) {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Pending>();
  const queue = createMediaWorkQueue(options.concurrency ?? 2);
  const maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 64;
  const remove = (key: string, entry: Entry) => { entries.delete(key); options.revoke(entry.url); };
  const trim = () => {
    let bytes = [...entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    for (const [key, entry] of [...entries].sort((a, b) => a[1].touched - b[1].touched)) {
      if (bytes <= maxBytes && entries.size <= maxEntries) break;
      if (entry.readers) continue;
      bytes -= entry.bytes; remove(key, entry);
    }
  };
  return {
    acquire(key: string, id: string, load: (signal: AbortSignal) => Promise<Blob>) {
      let released = false;
      const cached = entries.get(key);
      let request: Pending | undefined;
      let promise: Promise<Entry>;
      if (cached) {
        cached.readers++; cached.touched = Date.now(); promise = Promise.resolve(cached);
      } else {
        request = pending.get(key);
        if (!request) {
          const controller = new AbortController();
          const work: Promise<Entry> = queue.run(controller.signal, async () => {
            const blob = await load(controller.signal);
            controller.signal.throwIfAborted();
            const entry = { id, url: options.create(blob), bytes: blob.size, readers: created.readers, touched: Date.now() };
            created.entry = entry;
            entries.set(key, entry); trim();
            return entry;
          });
          const created: Pending = { id, readers: 0, controller, promise: work };
          pending.set(key, created);
          void created.promise.finally(() => { if (pending.get(key) === created) pending.delete(key); }).catch(() => undefined);
          request = created;
        }
        request.readers++;
        promise = request.promise;
      }
      return {
        promise: promise.then(entry => entry.url),
        release() {
          if (released) return;
          released = true;
          const entry = cached ?? request?.entry;
          if (entry) { entry.readers = Math.max(0, entry.readers - 1); entry.touched = Date.now(); }
          else if (request && --request.readers === 0) {
            request.controller.abort();
            if (pending.get(key) === request) pending.delete(key);
          }
          trim();
        },
      };
    },
    forget(ids: string[]) {
      const selected = new Set(ids);
      for (const [key, entry] of entries) if (selected.has(entry.id)) remove(key, entry);
      for (const [key, request] of pending) if (selected.has(request.id)) { request.controller.abort(); pending.delete(key); }
    },
    clear() {
      for (const request of pending.values()) request.controller.abort();
      pending.clear();
      for (const [key, entry] of entries) remove(key, entry);
    },
  };
}
