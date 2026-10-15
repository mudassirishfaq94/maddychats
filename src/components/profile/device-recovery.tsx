"use client";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { createRecoveryFile, readRecoveryFile, recoveryBundleKey, validateRecoveryBundle, collectRecoveryBundle } from "@/lib/device-recovery-file";

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
    const bundle = collectRecoveryBundle(user.id, encryption.deviceId);
    const result = await createRecoveryFile(bundle);
    const url = URL.createObjectURL(new Blob([result.file], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "circlo-encryption-recovery.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setExportCode(result.code);
    setStatus("Recovery file downloaded. Save the recovery code separately in your password manager.");
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
    // One atomic write; a quota error leaves the existing browser identity intact.
    localStorage.setItem(recoveryBundleKey(user.id), JSON.stringify(bundle));
    setCode("");
    window.location.reload();
  }
  return <section className="mt-4 min-w-0 rounded-xl border border-[var(--border)] p-3 sm:p-4">
    <h3 className="font-semibold">Keep a recovery file</h3>
    <p className="mt-2 text-sm text-[var(--muted)]">Save this browser&apos;s encryption identity and locally stored chat keys before changing browsers or clearing data. The file is encrypted on your device; its recovery code is never sent to our server. This is not a full message, media, draft, or Signal session backup.</p>
    <button className="btn btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => void run(backup)}>Download encrypted recovery file</button>
    {exportCode && <div className="mt-3 text-sm"><p>Save this code separately. Anyone with both the file and code can read the keys it contains.</p><code className="mt-2 block break-all select-all" aria-label="Recovery file code">{exportCode}</code></div>}
    <details className="mt-4"><summary className="cursor-pointer font-medium">Restore a recovery file or move from the old website</summary>
      <p className="mt-2 text-sm">On the original browser, visit <a className="underline" href="https://maddychats.onrender.com/device-migration">the old-site migration page</a>, download the file, then import it here on circlo.chat. Use the same account. A previously revoked identity still needs approval; importing never overrides revocation.</p>
      <label className="mt-3 block text-sm">Encrypted recovery file<input className="mt-1 block max-w-full" type="file" accept=".json,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <label className="mt-3 block text-sm">Recovery file code<input className="field-input mt-1 w-full" type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} /></label>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I saved a recovery file for any keys I need from this browser. Import will replace its active encryption identity.</label>
      <button className="btn btn-secondary mt-3" disabled={busy || !file || !code || !confirmed} onClick={() => void run(restore)}>Restore encryption identity</button>
    </details>
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
  </section>;
}
