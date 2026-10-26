"use client";
import { useEffect, useState } from "react";
import { collectRecoveryBundle, createRecoveryFile } from "@/lib/device-recovery-file";

/** Local-only export also works when the old website's login session expired. */
export function DomainMigration() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      const ids = Object.keys(localStorage).filter(key => /^e2ee_keypair_[a-f0-9-]{36}$/.test(key)).map(key => key.slice("e2ee_keypair_".length));
      setAccounts(ids); setAccount(ids[0] ?? "");
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function download() {
    setBusy(true); setStatus("");
    try {
      const result = await createRecoveryFile(await collectRecoveryBundle(account, localStorage.getItem("e2ee_device_id") ?? ""));
      const url = URL.createObjectURL(new Blob([result.file], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "circlo-encryption-recovery.json"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000); setCode(result.code);
      setStatus("File downloaded. Keep the code separately and import both on circlo.chat, using the same account.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to export these keys."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Move your encryption keys to circlo.chat</h1>
    <p>This page reads only the keys stored in this browser on this website. You can export even if your old login expired. No private keys are uploaded.</p>
    {accounts.length ? <label className="block">Account identity<select className="field-input mt-2 w-full" value={account} onChange={event => setAccount(event.target.value)}>{accounts.map(id => <option key={id} value={id}>{id}</option>)}</select></label> : <p>No encryption keys were found here. Try the original browser and profile where your messages were readable. Otherwise use a saved recovery file or device linking on circlo.chat.</p>}
    <button className="btn btn-primary" disabled={busy || !account} onClick={() => void download()}>Export encrypted migration file</button>
    {code && <div><p>Save this code separately. Both the file and code are needed to restore.</p><code className="block break-all select-all" aria-label="Migration recovery code">{code}</code></div>}
    {status && <p role="status">{status}</p>}
    <p>On <a className="underline" href="https://circlo.chat/app/profile#encryption-devices">Circlo → Profile → Encryption devices</a>, open “Restore a recovery file” and choose this file. This restores the existing identity; it does not reset other devices or override revocation.</p>
    <p className="text-sm text-[var(--muted)]">Includes encryption identity and locally saved chat keys. Messages, media, drafts and Signal sessions are not included. Keep the original browser data until you have verified your chats on circlo.chat.</p>
  </main>;
}
