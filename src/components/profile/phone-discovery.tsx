"use client";
import { useEffect, useState } from "react";
export function PhoneDiscovery() {
  const [settings, setSettings] = useState<{ available: boolean; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/contacts/phone", { signal: abort.signal, cache: "no-store" }).then(async res => { if (res.ok) setSettings(await res.json()); }).catch(() => {});
    return () => abort.abort();
  }, []);
  if (!settings?.available) return null;
  return <div className="mt-4 rounded-2xl border border-[var(--border)] p-4"><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={settings.enabled} disabled={busy} onChange={async event => {
    const enabled = event.target.checked; setBusy(true); setError("");
    try { const res = await fetch("/api/contacts/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }), signal: AbortSignal.timeout(10000) }); if (!res.ok) throw new Error(); setSettings({ ...settings, enabled }); }
    catch { setError("Could not save. Please try again."); } finally { setBusy(false); }
  }} /><span>Let people find me using my exact verified phone number<span className="mt-1 block text-xs text-[var(--muted)]">Your number is never included in search results. Turn this off at any time.</span></span></label>{error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}</div>;
}
