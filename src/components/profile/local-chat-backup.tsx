"use client";

import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { backupCode, backupKey, openChatBackup, base64ToBytes, type ChatBackup } from "@/lib/local-chat-backup";
import { readBackupRecord, refreshLocalBackup, writeBackupRecords, patchBackupSettings, type BackupSettings } from "@/lib/local-chat-backup-store";
import { rewrapRecoveryHistory, commitRecoveredHistory } from "@/lib/device-recovery-file";
import { isNativeApp } from "@/lib/native-platform";
import { saveHostedFile } from "@/lib/native-push-bridge";
import { FileChip } from "@/components/chats/attachments";
import { E2EEMediaProvider } from "@/components/chats/e2ee-context";
import type { AttachmentDTO } from "@/lib/types";
import { chatLocked } from "../../../public/offline-store.js";

const unlockedBackup = (data: ChatBackup): ChatBackup => ({ ...data, chats: data.chats.filter(chat => !chatLocked(chat.id)), calls: data.calls.filter(call => !call.conversationId || !chatLocked(call.conversationId)) });

export function LocalChatBackupSettings({ restoreOnly = false }: { restoreOnly?: boolean }) {
  const { user } = useAuth();
  return <LocalChatBackupContent key={user?.id ?? "signed-out"} restoreOnly={restoreOnly}/>;
}

function LocalChatBackupContent({ restoreOnly = false }: { restoreOnly?: boolean }) {
  const { user } = useAuth(); const encryption = useSharedE2EE();
  const [settings, setSettings] = useState<BackupSettings>();
  const [hasImported, setHasImported] = useState(false);
  const [generated, setGenerated] = useState(""), [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [snapshot, setSnapshot] = useState<ChatBackup | null>(null), [selected, setSelected] = useState("");
  const work = useRef<AbortController | null>(null);
  const presentBackup = (data: ChatBackup) => setSnapshot(unlockedBackup(data));
  useEffect(() => { return () => work.current?.abort(); }, []);
  useEffect(() => {
    const locksChanged = () => { setSnapshot(value => value ? unlockedBackup(value) : null); setSelected(value => value && chatLocked(value) ? "" : value); };
    const storageChanged = (event: StorageEvent) => { if (event.key === null || event.key === "maddy:locked-chats") locksChanged(); };
    window.addEventListener("maddy:locked-chats", locksChanged); window.addEventListener("storage", storageChanged);
    return () => { window.removeEventListener("maddy:locked-chats", locksChanged); window.removeEventListener("storage", storageChanged); };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () => { void Promise.all([readBackupRecord(user.id, "settings"), readBackupRecord(user.id, "restored")]).then(([value, imported]) => { if (active) { setSettings(value); setHasImported(Boolean(imported)); } }).catch(() => { if (active) setStatus("Local backup storage is unavailable on this device."); }); };
    load(); window.addEventListener("circlo:local-backup", load);
    return () => { active = false; work.current?.abort(); window.removeEventListener("circlo:local-backup", load); };
  }, [user]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    const controller = new AbortController(); work.current?.abort(); work.current = controller;
    setBusy(true); setStatus("");
    try { await action(controller.signal); }
    catch (cause) { if (!controller.signal.aborted) setStatus(cause instanceof Error ? cause.message : "Backup could not finish. Your previous backup is safe."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function backup(signal: AbortSignal) {
    if (!user) return;
    await encryption.waitForDeviceRegistration(); signal.throwIfAborted();
    setStatus("Saving a spare copy of your chats on this device… You can cancel at any time.");
    const result = await refreshLocalBackup({ userId: user.id, deviceId: encryption.deviceId, signal, decrypt: encryption.decrypt, manual: true });
    presentBackup(result);
    setStatus(`Backup saved on this device. ${result.chats.length} chats. ${result.missingMedia ? `${result.missingMedia} media files could not be copied; keep their originals.` : "Available media copied."}${result.unreadableMessages ? ` ${result.unreadableMessages} older messages still need recovery.` : ""}`);
  }
  async function download() {
    if (!user) return;
    const archive = await readBackupRecord(user.id, "archive");
    if (!archive) throw new Error("Create a backup first.");
    const name = `circlo-chats-${new Date().toISOString().slice(0, 10)}.circlo`;
    if (isNativeApp()) { if (!await saveHostedFile(archive, name)) throw new Error("This APK cannot save backup files yet. Install the updated APK and try again."); }
    else { const url = URL.createObjectURL(archive); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
    setStatus("Backup file saved. Check Downloads or the folder you chose. Keep a copy on another device, and keep its backup code separately.");
  }
  async function restore(signal: AbortSignal) {
    if (!user || !file || !confirmed) return;
    const key = await backupKey(code);
    const data = await openChatBackup(file, key, user.id);
    if (!encryption.initialized || !encryption.publicKey) throw new Error("Wait for this device to finish setting up, then restore again.");
    const response = await fetch("/api/e2ee/keys", { cache: "no-store", signal });
    if (!response.ok) throw new Error("Sign in again before restoring.");
    const { keys } = await response.json();
    if (!keys.some((item: { deviceId: string; publicKey: string }) => item.deviceId === encryption.deviceId && item.publicKey === encryption.publicKey)) throw new Error("This device is no longer registered. Sign in again.");
    const recovered = await rewrapRecoveryHistory(data.recovery, user.id, encryption.publicKey);
    const identity = await fetch("/api/auth/me", { cache: "no-store", signal });
    if ((await identity.json()).user?.id !== user.id) throw new Error("Account changed. Restore cancelled.");
    signal.throwIfAborted();
    // Local archive restoration never approves/revives a revoked device or
    // writes old messages into a server conversation. Server trust still applies.
    await commitRecoveredHistory(user.id, recovered, () => writeBackupRecords(user.id, { restored: { archive: file, key, savedAt: data.createdAt } }), signal);
    window.dispatchEvent(new Event("maddy:recovery-keys-changed"));
    setCode(""); presentBackup(data); setStatus("Your saved chats are back on this device. If Circlo asks you to link this device, finish that step before opening your chats.");
  }
  return <section id="local-chat-backup" className="mt-4 min-w-0 rounded-2xl border border-[var(--border)] p-4">
    <h3 className="flex items-center gap-2 font-semibold"><HardDrive className="h-5 w-5"/>{restoreOnly ? "Bring back saved chats" : "Save a copy of your chats"}</h3>
    <p className="mt-2 text-sm text-[var(--muted)]">{restoreOnly ? "Choose the backup file you saved, then enter its backup code to bring your chats back." : "A backup is a spare copy of your chats, available photos and files, and available call history. It stays on this device until you save a backup file elsewhere."}</p>
    <p className="mt-2 text-xs text-[var(--muted)]">Your backup code unlocks the file. Keep the code on paper or in a password manager, separately from the file. Circlo cannot reset a lost backup code.</p>
    {!restoreOnly ? <details className="mt-2 text-xs text-[var(--muted)]"><summary className="min-h-11 cursor-pointer py-2">When backups run and what they include</summary><p>Daily backups run only while Circlo is open and online. Locked and disappearing chats are left out. Save a backup file elsewhere before uninstalling Circlo or clearing its data.</p><p className="mt-2">Photos and files can use up to 96 MB; the whole backup can use up to 128 MB. Keep originals of any files that do not fit.</p></details> : null}
    {!restoreOnly ? <>
      <p className="mt-3 text-sm">{settings?.savedAt ? `Last saved: ${new Date(settings.savedAt).toLocaleString()}` : "No local backup saved yet."}{settings?.enabled ? " · Daily backup on" : " · Daily backup off"}</p>
      {!settings && !generated ? <button type="button" className="btn btn-primary mt-3 min-h-11" disabled={busy || !encryption.initialized} onClick={() => setGenerated(backupCode())}>Set up local backup</button> : null}
      {generated ? <div className="mt-3 space-y-3 text-sm"><p>This is your backup code, not your sign-in password. Save it on paper or in a password manager. You will need it to open a saved backup file.</p><code aria-label="Local backup code" className="block select-all break-all rounded-lg bg-[var(--card-2)] p-3">{generated}</code><label className="block">Enter your saved backup code to check it<input type="password" autoComplete="off" className="field-input mt-1 w-full" value={code} onChange={event => setCode(event.target.value)}/></label><button type="button" className="btn btn-primary min-h-11" disabled={busy || code.trim() !== generated} onClick={() => void run(async signal => { if (!user) return; const key = await backupKey(generated); await writeBackupRecords(user.id, { settings: { enabled: true, key } }); setGenerated(""); setCode(""); await navigator.storage?.persist?.().catch(() => false); await backup(signal); })}>I saved the code · Create backup</button></div> : null}
      {settings ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn btn-primary min-h-11" disabled={busy || !encryption.initialized} onClick={() => void run(async signal => { await backup(signal); })}>Back up now</button><button type="button" className="btn btn-secondary min-h-11" disabled={busy || !settings.savedAt} onClick={() => void run(download)}><Download className="h-4 w-4"/>Save backup file</button><button type="button" className="btn btn-secondary min-h-11" disabled={busy || !settings.savedAt} onClick={() => void run(async () => { if (!user) return; const archive = await readBackupRecord(user.id, "archive"); if (archive) presentBackup(await openChatBackup(archive, settings.key, user.id)); })}>View saved chats</button><button type="button" className="btn btn-secondary min-h-11" disabled={busy} onClick={() => void run(async () => { if (user) await patchBackupSettings(user.id, { enabled: !settings.enabled }); })}>{settings.enabled ? "Pause daily backup" : "Enable daily backup"}</button></div> : null}
      {settings?.error ? <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{settings.error}</p> : null}
    </> : null}
    <details className="mt-4" open={restoreOnly}><summary className="min-h-11 cursor-pointer py-2 font-semibold">Restore from a backup file</summary><p className="text-xs text-[var(--muted)]">Sign in to the same account, choose your saved backup file and enter its backup code. An email sign-in code cannot unlock this file.</p><label className="mt-3 block text-sm">Circlo backup file<input className="mt-2 block max-w-full" type="file" accept=".circlo,application/octet-stream" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label><label className="mt-3 block text-sm">Saved backup code<input type="password" autoComplete="off" className="field-input mt-1 w-full" value={code} onChange={event => setCode(event.target.value)}/></label><label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>Add these saved chats to this device. Keep my existing chats too.</label><button type="button" className="btn btn-primary mt-3 min-h-11" disabled={busy || !file || !code || !confirmed} onClick={() => void run(restore)}><ShieldCheck className="h-4 w-4"/>Restore my chats</button></details>
    {busy ? <button type="button" className="btn btn-secondary mt-3 min-h-11" onClick={() => { work.current?.abort(); setBusy(false); setStatus("Backup cancelled. Your previous backup is safe."); }}>Cancel</button> : null}
    {hasImported ? <button type="button" className="btn btn-secondary mt-3 min-h-11" disabled={busy} onClick={() => void run(async () => { if (!user) return; const imported = await readBackupRecord(user.id, "restored"); if (imported) presentBackup(await openChatBackup(imported.archive, imported.key, user.id)); })}>View imported chats</button> : null}
    {status ? <p role="status" className="mt-3 text-sm">{status}</p> : null}
    {snapshot ? <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4"><p className="text-sm font-semibold">Saved chats · {snapshot.chats.reduce((n, chat) => n + chat.messages.length, 0)} messages · {snapshot.calls.length} call records</p><label htmlFor="backup-chat-history" className="block text-sm">Choose a saved chat</label><select id="backup-chat-history" className="field-input mt-1 w-full" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a chat</option>{snapshot.chats.map(chat => <option key={chat.id} value={chat.id}>{chat.name} ({chat.messages.length})</option>)}</select>{snapshot.chats.find(chat => chat.id === selected) ? <BackupChat key={selected} chat={snapshot.chats.find(chat => chat.id === selected)!}/> : null}<BackupCalls calls={snapshot.calls}/><button type="button" className="btn btn-secondary min-h-11" onClick={() => { setSnapshot(null); setSelected(""); }}>Close saved chats</button></div> : null}
  </section>;
}

function BackupChat({ chat }: { chat: ChatBackup["chats"][number] }) {
  const encryption = useSharedE2EE(); const [limit, setLimit] = useState(30);
  const rows = chat.messages.slice(-limit);
  return <E2EEMediaProvider conversationId={chat.id} decryptMedia={encryption.decryptMedia} initialized={encryption.initialized} initializationError={encryption.error}><div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-xl bg-[var(--surface-2)] p-3" aria-label="Saved chat history">{limit < chat.messages.length ? <button type="button" className="btn btn-secondary min-h-11 w-full" onClick={() => setLimit(value => value + 30)}>Show older saved messages</button> : null}{rows.map(row => <article key={row.id} className="rounded-xl bg-[var(--card)] p-3"><p className="text-xs font-semibold">{row.senderName}<time className="ml-2 font-normal text-[var(--muted)]">{new Date(row.createdAt).toLocaleString()}</time></p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{row.text || (row.ciphertext ? "This message was not readable when the backup was made." : "")}</p>{row.attachments.map(file => <BackupFile key={file.id} file={file}/>)}</article>)}</div></E2EEMediaProvider>;
}
function BackupFile({ file }: { file: ChatBackup["chats"][number]["messages"][number]["attachments"][number] }) {
  const [url, setUrl] = useState("");
  const activeUrl = useRef("");
  useEffect(() => () => { if (activeUrl.current) URL.revokeObjectURL(activeUrl.current); }, []);
  if (!file.data) return <p className="mt-2 text-xs text-[var(--muted)]">{file.originalName} · Media was not copied into this backup.</p>;
  return url ? <div className="mt-2"><FileChip file={{ ...file, url, kind: "file" } as AttachmentDTO} own={false} initiallyRequested/></div> : <button type="button" className="btn btn-secondary mt-2 min-h-11 max-w-full break-all" onClick={() => { const value = URL.createObjectURL(new Blob([base64ToBytes(file.data!)], { type: file.encrypted ? "application/octet-stream" : file.mimeType })); activeUrl.current = value; setUrl(value); }}>Prepare saved {file.originalName}</button>;
}

function BackupCalls({ calls }: { calls: ChatBackup["calls"] }) {
  const [limit, setLimit] = useState(50);
  return <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Saved call history ({calls.length})</summary><ul className="max-h-80 space-y-2 overflow-auto">{calls.slice(0, limit).map(call => <li key={call.id} className="rounded-lg bg-[var(--surface-2)] p-3 text-xs"><p className="font-semibold">{call.name || "Contact"}</p><p className="mt-1 text-[var(--muted)]">{call.direction || "Call"} · {call.outcome || "Call record"} · {new Date(call.createdAt).toLocaleString()}</p></li>)}</ul>{limit < calls.length ? <button type="button" className="btn btn-secondary mt-2 min-h-11" onClick={() => setLimit(value => value + 50)}>Show older calls</button> : null}</details>;
}
