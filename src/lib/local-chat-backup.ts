import { z } from "zod";
import { validateRecoveryBundle, type RecoveryBundle } from "./device-recovery-file";
import { isActiveContentType } from "./media-types";
import type { MessageDTO } from "./types";

export const BACKUP_MAX_BYTES = 128 * 1024 * 1024;
export const BACKUP_DAY = 86_400_000;
const string = z.string().max(4000);
const attachment = z.object({ id: z.uuid(), originalName: string, mimeType: string, size: z.number().nonnegative(), kind: z.enum(["image", "video", "file", "audio"]), encrypted: z.boolean(), encKey: z.string().max(10000).nullable(), data: z.string().max(BACKUP_MAX_BYTES).optional() });
const message = z.object({ id: z.uuid(), senderId: z.uuid(), senderName: string, createdAt: z.iso.datetime(), text: z.string().max(100000), ciphertext: z.string().max(100000).optional(), attachments: z.array(attachment).max(20) });
const snapshotSchema = z.object({ format: z.literal("circlo-chats-v1"), userId: z.uuid(), createdAt: z.iso.datetime(), recovery: z.unknown(), chats: z.array(z.object({ id: z.uuid(), name: string, messages: z.array(message).max(200000) })).max(5000), calls: z.array(z.object({ id: z.uuid(), createdAt: z.iso.datetime(), name: string.nullable(), direction: string.nullable(), outcome: string.nullable(), conversationId: z.uuid().nullable() })).max(200000), missingMedia: z.number().int().nonnegative(), unreadableMessages: z.number().int().nonnegative() });
export type ChatBackup = Omit<z.infer<typeof snapshotSchema>, "recovery"> & { recovery: RecoveryBundle };
export type BackupMessage = ChatBackup["chats"][number]["messages"][number];

export function backupEligible(message: MessageDTO): boolean {
  return !message.deletedAt && !message.deletedForMe && !message.selfDestruct && !message.expiresAt && !message.sendStatus;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export const base64ToBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
export const backupCode = () => bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function backupKey(code: string): Promise<CryptoKey> {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(code.trim())) throw new Error("Enter your complete saved backup code.");
  return crypto.subtle.importKey("raw", base64ToBytes(code.trim().replace(/-/g, "+").replace(/_/g, "/") + "="), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function validateChatBackup(value: unknown, userId: string): Promise<ChatBackup> {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success || parsed.data.userId !== userId) throw new Error("This backup is invalid or belongs to a different account.");
  const data = parsed.data as ChatBackup;
  await validateRecoveryBundle(data.recovery, userId);
  if (data.chats.some(chat => chat.messages.some(row => row.attachments.some(file => isActiveContentType(file.mimeType))))) throw new Error("This backup contains a file that cannot be opened safely.");
  return data;
}
export async function sealChatBackup(snapshot: ChatBackup, key: CryptoKey): Promise<Blob> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  if (bytes.byteLength > BACKUP_MAX_BYTES) throw new Error("This backup exceeds this device's 128 MB archive limit. Your last saved backup is safe.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = JSON.stringify({ format: "circlo-backup-v1", userId: snapshot.userId, iv: bytesToBase64(iv) });
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(header) }, key, bytes);
  return new Blob([header + "\n", encrypted], { type: "application/octet-stream" });
}
export async function openChatBackup(file: Blob, key: CryptoKey, userId: string): Promise<ChatBackup> {
  if (file.size > BACKUP_MAX_BYTES + 1024 || file.size < 32) throw new Error("This backup is too large or incomplete.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const end = bytes.indexOf(10);
  if (end < 1 || end > 1000) throw new Error("This is not a Circlo chat backup.");
  const header = new TextDecoder().decode(bytes.subarray(0, end));
  let value: unknown;
  try {
    const meta = JSON.parse(header);
    if (meta.format !== "circlo-backup-v1" || meta.userId !== userId || typeof meta.iv !== "string") throw new Error("Invalid header");
    const iv = base64ToBytes(meta.iv);
    if (iv.length !== 12) throw new Error("Invalid IV");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(header) }, key, bytes.subarray(end + 1));
    value = JSON.parse(new TextDecoder().decode(plain));
  } catch { throw new Error("The backup code is incorrect, the account is different, or the file is damaged."); }
  return validateChatBackup(value, userId);
}
