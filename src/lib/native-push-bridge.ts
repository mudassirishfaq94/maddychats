/** Exact-origin AndroidX message port. No cookies, keys or arbitrary native commands. */
export type AndroidNotificationStatus = { enabled: boolean; messagesImportance: number | null; callsImportance?: number | null; fullScreenAllowed?: boolean };
export type CallAudioState = { selected: string; devices: { id: string; label: string }[] };
type Reply = { id: string; token?: string; error?: string; status?: AndroidNotificationStatus; audio?: CallAudioState };
type Port = { postMessage: (message: string) => void; onmessage: ((event: MessageEvent<string>) => void) | null };
declare global { interface Window { CircloPush?: Port } }
const pending = new Map<string, (reply: Reply) => void>();
export function hasHostedPushBridge(): boolean { return typeof window !== "undefined" && Boolean(window.CircloPush); }
type CallSession = { callId: string; userId: string; clientId?: string; conversationId?: string; actionToken?: string; connected?: boolean; muted?: boolean; deviceId?: string };
type NativeFile = { name: string; mime: string; data: string };
async function request(command: "token" | "request" | "bind" | "reconcile" | "clear" | "settings" | "status" | "dismiss" | "preview" | "preview-finished" | "privacy" | "call-start" | "call-renew" | "call-stop" | "call-settings" | "call-answer" | "call-audio" | "open-file", userId?: string, notification?: LocalNotification, lockedChats?: string[] | null, call?: CallSession, notificationId?: string, file?: NativeFile): Promise<Reply | null> {
  const port = window.CircloPush;
  if (!port) return null;
  port.onmessage = event => {
    try { const reply = JSON.parse(event.data) as Reply; pending.get(reply.id)?.(reply); } catch { /* Ignore malformed native replies. */ }
  };
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Native action did not respond. Please retry.")); }, command === "open-file" ? 60_000 : 15_000);
    pending.set(id, reply => {
      clearTimeout(timer); pending.delete(id);
      if (reply.error) reject(new Error(reply.error)); else resolve(reply);
    });
    try { port.postMessage(JSON.stringify({ id, command, userId, notification, notificationId, lockedChats, file, ...call })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error("Notification bridge unavailable.")); }
  });
}

/** Metadata stays on-device; older APKs continue using their existing web call path. */
export async function hostedCall(command: "call-start" | "call-renew" | "call-stop" | "call-answer", call: CallSession): Promise<boolean> {
  if (!hasHostedPushBridge()) return false;
  try { return (await request(command, call.userId, undefined, undefined, call))?.token === "active"; }
  catch { return false; }
}

/** Available communication routes only; never accepts arbitrary system settings. */
export async function hostedCallAudio(call: CallSession): Promise<CallAudioState | null> {
  if (!hasHostedPushBridge()) return null;
  const value = (await request("call-audio", call.userId, undefined, undefined, call))?.audio;
  return value && Array.isArray(value.devices) && typeof value.selected === "string" ? value : null;
}

export async function hostedPush(command: "token" | "request" | "bind" | "reconcile" | "clear" | "settings" | "dismiss", userId?: string): Promise<string | null> {
  return (await request(command, userId))?.token ?? null;
}
export async function androidNotificationStatus(): Promise<AndroidNotificationStatus | null> {
  const status = (await request("status"))?.status;
  if (!status || typeof status.enabled !== "boolean" || (status.messagesImportance !== null && typeof status.messagesImportance !== "number")) return null;
  return status;
}
export async function androidCallSettings(): Promise<void> { await request("call-settings"); }

/** Open an already-decrypted attachment with Android's registered file viewer. */
export async function openHostedFile(blob: Blob, name: string): Promise<boolean> {
  if (!hasHostedPushBridge() || blob.size > 20 * 1024 * 1024) return false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  const reply = await request("open-file", undefined, undefined, undefined, undefined, undefined, {
    name,
    mime: blob.type || "application/octet-stream",
    data: btoa(binary),
  });
  return reply?.token === "opened";
}

interface LocalNotification { recipientId: string; notificationId: string; conversationId: string; messageId: string; title: string; body: string; silent: boolean; messagePreview?: boolean; senderName?: string; messageText?: string; isGroup?: boolean }
/** Plaintext crosses only the exact-origin on-device WebView bridge. */
export async function showLocalNotification(notification: LocalNotification): Promise<void> {
  if (hasHostedPushBridge()) await request("preview", notification.recipientId, notification, undefined, undefined, notification.notificationId);
}

/** Tell the hidden notification WebView it may be released. No text is sent. */
export async function finishLocalNotificationPreview(notificationId: string): Promise<void> {
  if (hasHostedPushBridge()) await request("preview-finished", undefined, undefined, undefined, undefined, notificationId);
}

export async function syncNotificationPrivacy(userId: string, lockedChats: string[] | null): Promise<void> {
  if (!hasHostedPushBridge()) return;
  // Dismiss independently of list size; oversized/unknown state fails closed.
  await request("dismiss");
  const bounded = lockedChats && JSON.stringify(lockedChats).length <= 3000 ? lockedChats : null;
  await request("privacy", userId, undefined, bounded);
}
