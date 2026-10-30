/** Exact-origin AndroidX message port. No cookies, keys or arbitrary native commands. */
export type AndroidNotificationStatus = { enabled: boolean; messagesImportance: number | null; callsImportance?: number | null; fullScreenAllowed?: boolean };
export type CallAudioState = { selected: string; devices: { id: string; label: string }[] };
type Reply = { id: string; token?: string; error?: string; status?: AndroidNotificationStatus; audio?: CallAudioState };
type Port = { postMessage: (message: string) => void; onmessage: ((event: MessageEvent<string>) => void) | null };
declare global { interface Window { CircloPush?: Port } }
const pending = new Map<string, (reply: Reply) => void>();
export function hasHostedPushBridge(): boolean { return typeof window !== "undefined" && Boolean(window.CircloPush); }
type CallSession = { callId: string; userId: string; clientId?: string; conversationId?: string; actionToken?: string; connected?: boolean; muted?: boolean; deviceId?: string };
type NativeFile = { name: string; mime: string; data: string; size?: number; transfer?: string; offset?: number };
async function request(command: "token" | "request" | "bind" | "reconcile" | "clear" | "startup-bind" | "startup-clear" | "settings" | "status" | "dismiss" | "preview" | "preview-finished" | "privacy" | "call-start" | "call-renew" | "call-stop" | "call-settings" | "call-answer" | "call-audio" | "open-file" | "camera-settings" | "backup-start" | "backup-chunk" | "backup-finish" | "backup-cancel", userId?: string, notification?: LocalNotification, lockedChats?: string[] | null, call?: CallSession, notificationId?: string, file?: NativeFile): Promise<Reply | null> {
  const port = window.CircloPush;
  if (!port) return null;
  port.onmessage = event => {
    try { const reply = JSON.parse(event.data) as Reply; pending.get(reply.id)?.(reply); } catch { /* Ignore malformed native replies. */ }
  };
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Native action did not respond. Please retry.")); }, command === "backup-finish" ? 180_000 : command === "open-file" ? 60_000 : 15_000);
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

/** Local snapshot selection is independent of notification preferences. */
export async function syncHostedStartup(userId: string | null): Promise<void> {
  if (hasHostedPushBridge()) await request(userId ? "startup-bind" : "startup-clear", userId ?? undefined);
}
export async function androidNotificationStatus(): Promise<AndroidNotificationStatus | null> {
  const status = (await request("status"))?.status;
  if (!status || typeof status.enabled !== "boolean" || (status.messagesImportance !== null && typeof status.messagesImportance !== "number")) return null;
  return status;
}
export async function androidCallSettings(): Promise<void> { await request("call-settings"); }
export async function openHostedCameraSettings(): Promise<void> {
  if (!hasHostedPushBridge()) throw new Error("Camera settings are unavailable in this app version.");
  await request("camera-settings");
}

/** Copy only an encrypted Circlo archive to Android's user-selected document. */
export async function saveHostedFile(blob: Blob, name: string): Promise<boolean> {
  if (!hasHostedPushBridge()) return false;
  const file = { name, mime: "application/octet-stream", data: "", size: blob.size };
  let transfer: string | undefined;
  try { transfer = (await request("backup-start", undefined, undefined, undefined, undefined, undefined, file))?.token; }
  catch (cause) { if (cause instanceof Error && cause.message === "Unsupported notification command.") return false; throw cause; }
  if (!transfer) return false;
  try {
    for (let offset = 0; offset < blob.size; offset += 192 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 192 * 1024).arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      await request("backup-chunk", undefined, undefined, undefined, undefined, undefined, { ...file, transfer, offset, data: btoa(binary) });
    }
    return (await request("backup-finish", undefined, undefined, undefined, undefined, undefined, { ...file, transfer }))?.token === "saved";
  } catch (cause) {
    await request("backup-cancel", undefined, undefined, undefined, undefined, undefined, { ...file, transfer }).catch(() => {});
    throw cause;
  }
}

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
