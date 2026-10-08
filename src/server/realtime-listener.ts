import { Client, type Notification } from "pg";
import { pool } from "@/db";
import type { RealtimeEvent } from "@/lib/types";

export type Delivery = { id: string; userId: string; payload: RealtimeEvent };
type Subscriber = (row: Delivery | null) => void;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One dedicated LISTEN connection per process; event reads are shared by tabs.
 * A connection failure closes subscribers, letting EventSource reconnect and
 * recover durable events. No timer queries the event table while idle.
 */
class RealtimeListener {
  private client?: Client;
  private connecting?: Promise<void>;
  private subscribers = new Map<string, Set<Subscriber>>();
  private pending = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private flushing = false;

  private fail(client: Client) {
    if (this.client !== client) return;
    this.client = undefined;
    this.pending.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const callbacks = [...this.subscribers.values()].flatMap((set) => [...set]);
    for (const callback of callbacks) callback(null);
    void client.end().catch(() => undefined);
  }

  private notify = (message: Notification) => {
    if (message.channel !== "ziptalk_realtime" || !message.payload || message.payload.length > 100) return;
    let data: unknown;
    try { data = JSON.parse(message.payload); } catch { return; }
    if (!Array.isArray(data) || data.length !== 2 || !data.every((v) => typeof v === "string" && uuid.test(v))) return;
    if (!this.subscribers.has(data[0])) return;
    if (this.pending.size >= 4000) { if (this.client) this.fail(this.client); return; }
    this.pending.add(data[1]);
    if (!this.flushing && !this.timer) this.timer = setTimeout(() => void this.flush(), 5);
  };

  private async flush() {
    this.timer = undefined;
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.pending.size && this.client) {
        const ids = [...this.pending].slice(0, 400);
        ids.forEach((id) => this.pending.delete(id));
        const query = {
          text: 'SELECT id, user_id AS "userId", payload FROM realtime_events WHERE id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[]) ORDER BY created_at, id',
          values: [ids, [...this.subscribers.keys()]], query_timeout: 5000,
        };
        const { rows } = await pool.query<Delivery>(query);
        // Never trust the notification's claimed recipient: use the stored row.
        for (const row of rows) for (const callback of this.subscribers.get(row.userId) ?? []) callback(row);
      }
    } catch { if (this.client) this.fail(this.client); }
    finally { this.flushing = false; }
  }

  private async connect() {
    if (this.client && !this.connecting) return;
    if (this.connecting) return this.connecting;
    const connectionString = process.env.REALTIME_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Missing realtime database configuration");
    const address = new URL(connectionString);
    if (address.hostname.endsWith(".pooler.supabase.com") && address.port === "6543") {
      throw new Error("Realtime requires a direct or session-pooler database connection");
    }
    const client = new Client({ connectionString, application_name: "ziptalk-realtime-listener", connectionTimeoutMillis: 5000,
      query_timeout: 5000, statement_timeout: 5000,
      keepAlive: true, ssl: address.hostname.endsWith("supabase.co") || address.hostname.endsWith("supabase.com") ? { rejectUnauthorized: true } : undefined });
    this.client = client;
    client.on("notification", this.notify);
    client.on("error", () => this.fail(client));
    client.on("end", () => this.fail(client));
    this.connecting = (async () => {
      try { await client.connect(); await client.query("LISTEN ziptalk_realtime"); }
      catch (error) { this.fail(client); throw error; }
      finally { this.connecting = undefined; }
    })();
    return this.connecting;
  }

  async subscribe(userId: string, callback: Subscriber) {
    await this.connect();
    if (!this.client) throw new Error("Realtime listener disconnected");
    const subscribers = this.subscribers.get(userId) ?? new Set<Subscriber>();
    subscribers.add(callback); this.subscribers.set(userId, subscribers);
    return () => {
      subscribers.delete(callback);
      if (!subscribers.size) this.subscribers.delete(userId);
      // Retain one idle listener; it performs no queries and can be reused.
    };
  }

  async check() {
    await this.connect();
    if (!this.client) throw new Error("Realtime unavailable");
    await this.client.query("SELECT 1");
  }
}

const globalListener = globalThis as typeof globalThis & { __ziptalkRealtimeListener?: RealtimeListener };
export const realtimeListener = globalListener.__ziptalkRealtimeListener ??= new RealtimeListener();
