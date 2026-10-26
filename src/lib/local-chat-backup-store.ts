import { BACKUP_MAX_BYTES, backupEligible, bytesToBase64, sealChatBackup, validateChatBackup, type ChatBackup, type BackupMessage } from "./local-chat-backup";
import { collectRecoveryBundle } from "./device-recovery-file";
import { isActiveContentType } from "./media-types";
import type { ConversationSummary, MessagePage } from "./types";
import { chatLocked } from "../../public/offline-store.js";

export type BackupSettings = { enabled: boolean; key: CryptoKey; savedAt?: string; error?: string; failedAt?: number };
type Records = { settings?: BackupSettings; archive?: Blob; restored?: { archive: Blob; key: CryptoKey; savedAt: string } };
async function database(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`circlo-backup:${userId}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("backup");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Local backup storage is unavailable. Free some device storage and retry."));
  });
}
export async function readBackupRecord<K extends keyof Records>(userId: string, id: K): Promise<Records[K]> {
  const db = await database(userId);
  try { return await new Promise((resolve, reject) => { const tx = db.transaction("backup"); const request = tx.objectStore("backup").get(id); tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
export async function writeBackupRecords(userId: string, values: Records): Promise<void> {
  const db = await database(userId);
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("backup", "readwrite"); for (const [id, value] of Object.entries(values)) tx.objectStore("backup").put(value, id); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new Error("Backup could not be saved. Your previous backup is unchanged.")); }); }
  finally { db.close(); }
  if (values.settings) { try { localStorage.setItem(`circlo:local-backup-enabled:${userId}`, values.settings.enabled ? "1" : "0"); } catch { /* Scheduling is optional when localStorage is full. Manual backups still work. */ } }
  window.dispatchEvent(new Event("circlo:local-backup"));
}

/** Read consent and publish in one transaction; background work cannot undo a pause. */
async function updateBackupRecords(userId: string, update: (current: BackupSettings) => Records): Promise<void> {
  const db = await database(userId);
  let enabled: boolean | undefined;
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("backup", "readwrite"), store = tx.objectStore("backup"), request = store.get("settings");
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error("Enable local backups first.");
        const values = update(request.result);
        for (const [id, value] of Object.entries(values)) store.put(value, id);
        enabled = values.settings?.enabled;
      } catch (cause) { tx.abort(); reject(cause); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error("Backup could not be saved. Your previous backup is unchanged."));
  }); } finally { db.close(); }
  if (enabled !== undefined) { try { localStorage.setItem(`circlo:local-backup-enabled:${userId}`, enabled ? "1" : "0"); } catch {} }
  window.dispatchEvent(new Event("circlo:local-backup"));
}
export const patchBackupSettings = (userId: string, patch: Partial<Pick<BackupSettings, "enabled" | "error" | "failedAt">>) => updateBackupRecords(userId, current => ({ settings: { ...current, ...patch } }));

export async function collectChatBackup(input: { userId: string; deviceId: string; signal: AbortSignal; decrypt: (text: string, id: string) => Promise<string> }): Promise<ChatBackup> {
  const { userId, deviceId, signal, decrypt } = input;
  const json = async (url: string) => { signal.throwIfAborted(); const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) }); if (!response.ok) throw new Error("Backup paused. Reconnect and try again; your previous backup is safe."); const value = await response.json(); signal.throwIfAborted(); return value; };
  const checkAccount = async () => { if ((await json("/api/auth/me")).user?.id !== userId) throw new Error("Account changed. Start the backup again in the original account."); };
  await checkAccount();
  const list = await json("/api/conversations");
  if (list.viewerId !== userId) throw new Error("Account changed. Backup cancelled.");
  const chats: ChatBackup["chats"] = [];
  let bytes = 0, missingMedia = 0, unreadableMessages = 0;
  for (const chat of list.conversations as ConversationSummary[]) {
    signal.throwIfAborted();
    if (chatLocked(chat.id)) continue;
    // Locked chats require their own unlock; background backups cannot bypass it.
    const detailResponse = await fetch(`/api/conversations/${chat.id}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    if (!detailResponse.ok) throw new Error("A chat is no longer available. Retry your backup.");
    const detail = (await detailResponse.json()).conversation;
    if (detail.disappearingSeconds > 0) continue;
    const rows: BackupMessage[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page: MessagePage = await json(`/api/conversations/${chat.id}/messages?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      for (const row of page.messages.filter(backupEligible)) {
        let text = row.text;
        if (row.encrypted) { try { text = await decrypt(row.text, chat.id); } catch { text = ""; unreadableMessages++; } }
        const attachments: BackupMessage["attachments"] = [];
        for (const item of row.attachments) {
          if (item.expiresAt || isActiveContentType(item.mimeType)) continue;
          const { id, originalName, mimeType, size, kind, encrypted, encKey } = item;
          const file: BackupMessage["attachments"][number] = { id, originalName, mimeType, size, kind, encrypted, encKey };
          // Backups include media within a bounded device budget. Missing media
          // is counted and displayed, never reported as a complete media copy.
          if (bytes + size * 1.4 < BACKUP_MAX_BYTES * 0.75) {
            try {
              const response = await fetch(`/api/media/${id}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
              if (!response.ok) throw new Error("Unavailable media");
              const reader = response.body?.getReader(); if (!reader) throw new Error("Unavailable media");
              const chunks: Uint8Array[] = []; let length = 0;
              try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (bytes + length * 1.4 > BACKUP_MAX_BYTES * 0.75) throw new Error("Media budget exceeded"); chunks.push(part.value); } }
              finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
              const content = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
              file.data = bytesToBase64(content); bytes += file.data.length;
            } catch { signal.throwIfAborted(); missingMedia++; }
          } else missingMedia++;
          attachments.push(file);
        }
        rows.push({ id: row.id, senderId: row.senderId, senderName: row.sender.displayName, createdAt: row.createdAt, text, ...(row.encrypted ? { ciphertext: row.text } : {}), attachments });
        bytes += text.length * 3 + 1000;
        if (bytes > BACKUP_MAX_BYTES * 0.9) throw new Error("Chat history exceeds this device's 128 MB archive limit. Your previous backup is safe.");
      }
      cursor = page.hasMore ? page.nextCursor : null;
      if (cursor && seen.has(cursor)) throw new Error("Chat history did not finish loading. Retry your backup.");
      if (cursor) seen.add(cursor);
      await new Promise(resolve => setTimeout(resolve, 0));
    } while (cursor);
    chats.push({ id: chat.id, name: chat.name || chat.otherMember?.displayName || "Chat", messages: rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
  }
  const calls: ChatBackup["calls"] = [];
  let callCursor: string | null = null; const seenCallCursors = new Set<string>();
  do {
    const page = await json(`/api/calls/history${callCursor ? `?cursor=${encodeURIComponent(callCursor)}` : ""}`);
    calls.push(...page.calls); callCursor = page.nextCursor ?? null;
    if (callCursor && seenCallCursors.has(callCursor)) throw new Error("Call history did not finish loading. Retry your backup.");
    if (callCursor) seenCallCursors.add(callCursor);
    if (calls.length > 200000) throw new Error("Call history exceeds this device's backup limit.");
  } while (callCursor);
  await checkAccount(); signal.throwIfAborted();
  return { format: "circlo-chats-v1", userId, createdAt: new Date().toISOString(), recovery: collectRecoveryBundle(userId, deviceId), chats: chats.filter(chat => !chatLocked(chat.id)), calls: calls.filter(call => !call.conversationId || !chatLocked(call.conversationId)), missingMedia, unreadableMessages };
}

const pending = new Map<string, Promise<ChatBackup>>();
export function refreshLocalBackup(input: Parameters<typeof collectChatBackup>[0]): Promise<ChatBackup> {
  const previous = pending.get(input.userId); if (previous) return previous;
  const work = (async () => {
    const settings = await readBackupRecord(input.userId, "settings");
    if (!settings?.enabled) throw new Error("Enable local backups first.");
    const snapshot = await collectChatBackup(input);
    await validateChatBackup(snapshot, input.userId);
    const archive = await sealChatBackup(snapshot, settings.key);
    input.signal.throwIfAborted();
    await updateBackupRecords(input.userId, current => {
      if (!current.enabled) throw new Error("Daily backup is paused. Your previous backup is unchanged.");
      return { archive, settings: { ...current, failedAt: undefined, savedAt: snapshot.createdAt, error: snapshot.missingMedia || snapshot.unreadableMessages ? `Backup saved with ${snapshot.missingMedia} uncopied media files and ${snapshot.unreadableMessages} unreadable messages. Keep the originals and retry recovery.` : undefined } };
    });
    return snapshot;
  })();
  pending.set(input.userId, work);
  void work.finally(() => { if (pending.get(input.userId) === work) pending.delete(input.userId); }).catch(() => {});
  return work;
}
