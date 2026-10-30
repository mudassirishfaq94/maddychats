"use client";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { createRecoveryFile, readRecoveryFile, recoveryBundleKey, validateRecoveryBundle, collectRecoveryBundle, writeRecoveryIdentity } from "@/lib/device-recovery-file";

export function DeviceRecovery({restoreOnly=false}:{restoreOnly?:boolean}={}) {
  const { user } = useAuth();
  const encryption = useSharedE2EE();
  const [code, setCode] = useState("");
  const [exportCode, setExportCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true); setStatus("");
    try { await action(); } catch (error) { setStatus(error instanceof Error ? error.message : "Recovery could not finish."); }
    finally { setBusy(false); }
  }
  async function backup() {
    if (!user) return;
    await encryption.waitForDeviceRegistration();
    const bundle = await collectRecoveryBundle(user.id, encryption.deviceId);
    const result = await createRecoveryFile(bundle);
    const url = URL.createObjectURL(new Blob([result.file], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "circlo-encryption-recovery.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setExportCode(result.code);
    setStatus("Recovery file downloaded. Save the 24 words shown below separately from the file.");
  }
  async function restore() {
    if (!user || !file || !confirmed) return;
    if (file.size > 16 * 1024 * 1024) throw new Error("Recovery file is too large.");
    const bundle = await readRecoveryFile(await file.text(), code, user.id);
    const publicKey = await validateRecoveryBundle(bundle, user.id);
    const response = await fetch("/api/e2ee/keys", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Sign in and retry recovery.");
    const { keys } = await response.json() as { keys: Array<{ deviceId: string; publicKey: string; trustedAt: string | null }> };
    const registered = keys.find(key => key.deviceId === bundle.deviceId && key.publicKey === publicKey);
    if (!registered) throw new Error("This identity is no longer registered. Use device linking or emergency recovery.");
    // Secure storage is written and read back first; only then save the wrapped history keys.
    await writeRecoveryIdentity(bundle);
    localStorage.setItem(recoveryBundleKey(user.id), JSON.stringify({ ...bundle, keypair: "", secret: "" }));
    setCode("");
    window.location.reload();
  }
  return <section className="mt-4 min-w-0 rounded-xl border border-[var(--border)] p-3 sm:p-4">
    <h3 className="font-semibold">{restoreOnly?"Open a saved recovery file":"Save my chats"}</h3>
    {!restoreOnly && <><p className="mt-2 text-sm text-[var(--muted)]">Save this file and its 24-word recovery phrase before you change browsers or clear data. It holds what your chats need to reopen — not your messages, drafts, or attachments.</p>
    <button className="btn btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => void run(backup)}>Save recovery file</button></>}
    {exportCode && <div className="mt-3 text-sm"><p>Write down all 24 words in order and keep them separate from the file. Anyone with both can open your saved chat access.</p><code className="mt-2 block break-all select-all" aria-label="24-word recovery phrase">{exportCode}</code></div>}
    <details open={restoreOnly || undefined} className="mt-4"><summary className="min-h-11 cursor-pointer break-words py-2 font-medium">Restore a recovery file or move from the old website</summary>
      <p className="mt-2 text-sm">On the original browser, visit <a className="underline" href="https://maddychats.onrender.com/device-migration">the old-site migration page</a>, download the file, then import it here on circlo.chat. Use the same account. A previously revoked identity still needs approval; importing never overrides revocation.</p>
      <label className="mt-3 block text-sm">Older recovery file<input className="mt-1 block w-full min-w-0 max-w-full" type="file" accept=".json,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <label className="mt-3 block text-sm">Words or code saved with this file<input className="field-input mt-1 w-full min-w-0" type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} /></label>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I saved anything I need from this phone. This file will replace how this phone opens chats.</label>
      <button className="btn btn-secondary mt-3" disabled={busy || !file || !code || !confirmed} onClick={() => void run(restore)}>Open my saved file</button>
    </details>
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
  </section>;
}
