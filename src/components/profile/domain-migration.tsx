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
      setStatus("File saved. Check Downloads or the folder you chose. Keep its recovery words or code separately, then use both on circlo.chat with the same account.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "We couldn't save your chat key. Try again in the browser where your chats open."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Bring your chats to circlo.chat</h1>
    <p>This saves a spare chat key from this browser so your new browser can open older chats. The file does not contain messages or photos. Nothing is uploaded.</p>
    {accounts.length ? <label className="block">Choose the account saved in this browser<select className="field-input mt-2 w-full" value={account} onChange={event => setAccount(event.target.value)}>{accounts.map(id => <option key={id} value={id}>{id}</option>)}</select></label> : <p>No saved chat key was found in this browser. Try the browser where your chats still open, or use a recovery file you already saved.</p>}
    <button className="btn btn-primary" disabled={busy || !account} onClick={() => void download()}>Save file for the new website</button>
    {code && <div><p>Keep these recovery words or code on paper or in a password manager, separately from the file. You need both to open it.</p><code className="block break-all select-all" aria-label="Migration recovery code">{code}</code></div>}
    {status && <p role="status">{status}</p>}
    <p>On <a className="underline" href="https://circlo.chat/app/profile#encryption-devices">Circlo → Profile → Private chats and devices</a>, open “Back up or restore chats”, then “Use a saved file or move from the old website”. Choose your file and enter its words or code. A removed device still needs approval.</p>
    <p className="text-sm text-[var(--muted)]">Keep your old browser and its saved data until you have checked that your chats open on circlo.chat. This file does not include messages, photos, drafts or every kind of chat.</p>
  </main>;
}
