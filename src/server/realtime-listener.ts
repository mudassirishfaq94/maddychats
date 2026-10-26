import { Client, type Notification } from "pg";
import { pool } from "@/db";
import type { RealtimeEvent } from "@/lib/types";

export type Delivery = { id: string; userId: string; payload: RealtimeEvent; createdAt: Date };
type Subscriber = (row: Delivery | null) => void;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

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
  private pollTimer?: ReturnType<typeof setInterval>;
  private flushing = false;
  private polling = false;
  private cursors = new Map<string, { createdAt: Date; id: string }>();
  private delivered = new Set<string>();

  private emit(row: Delivery) {
    if (this.delivered.has(row.id)) return;
    this.delivered.add(row.id);
    if (this.delivered.size > 10000) this.delivered.delete(this.delivered.values().next().value!);
    for (const callback of this.subscribers.get(row.userId) ?? []) callback(row);
  }

  /** LISTEN/NOTIFY is the low-latency path; reconcile its durable outbox while
   * subscribers are active so a missed notification cannot strand an open chat. */
  private async poll() {
    if (this.polling || !this.subscribers.size) return;
    this.polling = true;
    try {
      const now = Date.now();
      const cursors = [...this.subscribers.keys()].map((userId) => {
        let cursor = this.cursors.get(userId);
        if (!cursor) {
          cursor = { createdAt: new Date(now - 1000), id: ZERO_UUID };
          this.cursors.set(userId, cursor);
        }
        return { user_id: userId, created_at: cursor.createdAt.toISOString(), event_id: cursor.id };
      });
      const query = {
        text: `WITH cursors AS (
          SELECT user_id, created_at, event_id FROM jsonb_to_recordset($1::jsonb)
          AS active(user_id uuid, created_at timestamptz, event_id uuid)
        )
        SELECT e.id, e.user_id AS "userId", e.payload, e.created_at AS "createdAt"
        FROM realtime_events e JOIN cursors c USING (user_id)
        WHERE (e.created_at, e.id) > (c.created_at, c.event_id)
        ORDER BY e.created_at, e.id LIMIT 400`,
        values: [JSON.stringify(cursors)], query_timeout: 5000,
      };
      const { rows } = await pool.query<Delivery>(query);
      for (const row of rows) {
        this.emit(row);
        // Only the durable scan advances the cursor. A later LISTEN notification
        // must not leap over an earlier outbox row whose notification was lost.
        this.cursors.set(row.userId, { createdAt: row.createdAt, id: row.id });
      }
    } catch {
      // Keep SSE alive; retry the durable outbox on the next short interval.
    } finally { this.polling = false; }
  }

  private ensurePolling() {
    if (this.pollTimer || !this.subscribers.size) return;
    this.pollTimer = setInterval(() => void this.poll(), 1000);
    void this.poll();
  }

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
          text: 'SELECT id, user_id AS "userId", payload, created_at AS "createdAt" FROM realtime_events WHERE id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[]) ORDER BY created_at, id',
          values: [ids, [...this.subscribers.keys()]], query_timeout: 5000,
        };
        const { rows } = await pool.query<Delivery>(query);
        // Never trust the notification's claimed recipient: use the stored row.
        for (const row of rows) this.emit(row);
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
    this.ensurePolling();
    return () => {
      subscribers.delete(callback);
      if (!subscribers.size) { this.subscribers.delete(userId); this.cursors.delete(userId); }
      if (!this.subscribers.size && this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = undefined; }
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
