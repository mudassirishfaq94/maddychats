"use client";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { createRecoveryFile, readRecoveryFile, recoveryBundleKey, validateRecoveryBundle, collectRecoveryBundle, writeRecoveryIdentity } from "@/lib/device-recovery-file";

export function DeviceRecovery() {
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
    setStatus("File saved. Check your Downloads folder or the folder you chose. Write down the recovery words below and keep them separately.");
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
    if (!registered) throw new Error("This saved chat key is no longer linked to your account. Link a device you still use, or choose email recovery.");
    // Secure storage is written and read back first; only then save the wrapped history keys.
    await writeRecoveryIdentity(bundle);
    localStorage.setItem(recoveryBundleKey(user.id), JSON.stringify({ ...bundle, keypair: "", secret: "" }));
    setCode("");
    window.location.reload();
  }
  return <section className="mt-4 min-w-0 rounded-xl border border-[var(--border)] p-3 sm:p-4">
    <h3 className="font-semibold">Save a spare chat key as a file</h3>
    <p className="mt-2 text-sm text-[var(--muted)]">Like a spare house key, this file helps you open older chats on another device. It does not contain your messages or photos.</p>
    <p className="mt-2 text-sm text-[var(--muted)]">Save the file somewhere you can find, such as Downloads. Keep its recovery words on paper or in a password manager, separately from the file.</p>
    <button className="btn btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => void run(backup)}>Save recovery file</button>
    {exportCode && <div className="mt-3 text-sm"><p>These 24 words unlock this file. Write them down in order; you need both the file and words. Never share them with anyone.</p><code className="mt-2 block select-all leading-7" aria-label="Recovery words">{exportCode}</code></div>}
    <details className="mt-4"><summary className="cursor-pointer font-medium">Use a saved file or move from the old website</summary>
      <p className="mt-2 text-sm">Choose the file you saved and enter its recovery words or code. Use the same Circlo account. A device you removed still needs approval.</p>
      <p className="mt-2 text-sm">Moving from the old website? On your old browser, open <a className="underline" href="https://maddychats.onrender.com/device-migration">the old-site transfer page</a> and save a file to use here.</p>
      <label className="mt-3 block text-sm">Choose your recovery file<input className="mt-1 block max-w-full" type="file" accept=".json,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <label className="mt-3 block text-sm">Recovery words or code saved with this file<input className="field-input mt-1 w-full" type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} /></label>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I saved a spare key for chats already on this device. I understand this replaces the chat key saved here.</label>
      <button className="btn btn-secondary mt-3" disabled={busy || !file || !code || !confirmed} onClick={() => void run(restore)}>Restore chat access</button>
    </details>
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
  </section>;
}
