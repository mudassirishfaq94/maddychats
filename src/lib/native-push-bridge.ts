/** Exact-origin AndroidX message port. No cookies, keys or arbitrary native commands. */
type Reply = { id: string; token?: string; error?: string };
type Port = { postMessage: (message: string) => void; onmessage: ((event: MessageEvent<string>) => void) | null };
declare global { interface Window { CircloPush?: Port } }
const pending = new Map<string, (reply: Reply) => void>();
export function hasHostedPushBridge(): boolean { return typeof window !== "undefined" && Boolean(window.CircloPush); }
export async function hostedPush(command: "token" | "request" | "bind" | "clear", userId?: string): Promise<string | null> {
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
      if (reply.error) reject(new Error(reply.error)); else resolve(reply.token ?? null);
    });
    try { port.postMessage(JSON.stringify({ id, command, userId })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error("Notification bridge unavailable.")); }
  });
}
