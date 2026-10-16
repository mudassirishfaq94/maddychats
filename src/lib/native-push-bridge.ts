/** Exact-origin AndroidX message port. No cookies, keys or arbitrary native commands. */
export type AndroidNotificationStatus = { enabled: boolean; messagesImportance: number | null };
type Reply = { id: string; token?: string; error?: string; status?: AndroidNotificationStatus };
type Port = { postMessage: (message: string) => void; onmessage: ((event: MessageEvent<string>) => void) | null };
declare global { interface Window { CircloPush?: Port } }
const pending = new Map<string, (reply: Reply) => void>();
export function hasHostedPushBridge(): boolean { return typeof window !== "undefined" && Boolean(window.CircloPush); }
async function request(command: "token" | "request" | "bind" | "clear" | "settings" | "status", userId?: string): Promise<Reply | null> {
  const port = window.CircloPush;
  if (!port) return null;
  port.onmessage = event => {
    try { const reply = JSON.parse(event.data) as Reply; pending.get(reply.id)?.(reply); } catch { /* Ignore malformed native replies. */ }
  };
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Notifications did not respond. Please retry.")); }, 15000);
    pending.set(id, reply => {
      clearTimeout(timer); pending.delete(id);
      if (reply.error) reject(new Error(reply.error)); else resolve(reply);
    });
    try { port.postMessage(JSON.stringify({ id, command, userId })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error("Notification bridge unavailable.")); }
  });
}

export async function hostedPush(command: "token" | "request" | "bind" | "clear" | "settings", userId?: string): Promise<string | null> {
  return (await request(command, userId))?.token ?? null;
}
export async function androidNotificationStatus(): Promise<AndroidNotificationStatus | null> {
  const status = (await request("status"))?.status;
  if (!status || typeof status.enabled !== "boolean" || (status.messagesImportance !== null && typeof status.messagesImportance !== "number")) return null;
  return status;
}
