"use client";
import { useEffect, useState } from "react";
import { callingCodes, discoveryPhone } from "@/lib/phone-numbers";
export function PhoneDiscovery() {
  const [callingCode, setCallingCode] = useState("");
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/contacts/phone", { signal: abort.signal, cache: "no-store" }).then(async res => { if (!res.ok) throw new Error(); const data = await res.json(); setPhone(data.phone ?? ""); setEnabled(data.enabled); setLoaded(true); }).catch(() => { if (!abort.signal.aborted) setMessage("Could not load phone settings. Reload to retry."); });
    return () => abort.abort();
  }, []);
  return <form className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] p-4" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    const normalized = phone.trim() ? discoveryPhone(phone, callingCode) : "";
    if (normalized === null) { setMessage("Enter an international phone number or choose its country code."); setBusy(false); return; }
    try { const res = await fetch("/api/contacts/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normalized, enabled: Boolean(normalized) && enabled }), signal: AbortSignal.timeout(10000) }); const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Could not save."); setPhone(normalized); if (!normalized) setEnabled(false); setMessage("Phone settings saved."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save. Please try again."); } finally { setBusy(false); }
  }}>
    <label className="block text-xs font-medium" htmlFor="contact-phone-country">Country calling code</label>
    <select id="contact-phone-country" className="field-input" value={callingCode} disabled={!loaded || busy} onChange={event => {
      const code = event.target.value; setCallingCode(code);
      if (!code) return;
      const old = [...callingCodes].sort((a,b) => b[0].length-a[0].length).find(([prefix]) => phone.startsWith(prefix))?.[0];
      setPhone(code + (old ? phone.slice(old.length) : phone.startsWith("+") ? "" : phone));
    }}><option value="">Other country / enter full number</option>{callingCodes.map(([code,country]) => <option key={code} value={code}>{country} ({code})</option>)}</select>
    <label className="block text-sm font-semibold" htmlFor="contact-phone">Phone number</label>
    <input id="contact-phone" type="tel" autoComplete="tel" inputMode="tel" className="field-input" placeholder="+923001234567" maxLength={32} value={phone} disabled={!loaded || busy} onChange={event => setPhone(event.target.value)} />
    <p className="text-xs text-[var(--muted)]">Include your country code. This number is provided by you, not verified. It cannot be used to sign in or recover your account. No SMS is sent.</p>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={enabled} disabled={!loaded || busy} onChange={event => setEnabled(event.target.checked)} /><span>Let people find me using my exact phone number</span></label>
    <p className="text-xs text-[var(--muted)]">Clear the number and save to remove it. A number match is not proof of identity.</p>
    <button type="submit" className="btn btn-secondary min-h-11" disabled={!loaded || busy}>{busy ? "Saving…" : "Save phone number"}</button>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </form>;
}
