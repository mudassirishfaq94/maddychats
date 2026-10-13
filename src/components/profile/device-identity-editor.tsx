"use client";
import { useState, type FormEvent } from "react";
import { COUNTRY_NAMES } from "@/server/device-meta";
export function DeviceIdentityEditor({ deviceId, name, country, onSaved }: { deviceId: string; name: string | null | undefined; country: string | null | undefined; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget); setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/e2ee/keys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, deviceName: fields.get("deviceName"), country: fields.get("country") }), signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to save device details.");
      await onSaved(); setStatus("Device details saved. Encryption approval is unchanged.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to save device details."); }
    finally { setBusy(false); }
  }
  return <details className="mt-3 text-sm"><summary className="cursor-pointer">Name this browser and set its country</summary><form onSubmit={event => void save(event)} className="mt-3 space-y-3">
    <label className="block">Device name<input className="field-input mt-1 w-full" name="deviceName" maxLength={60} defaultValue={name ?? ""} placeholder="My laptop — Chrome" /></label>
    <label className="block">Country (provided by you)<select className="field-input mt-1 w-full" name="country" defaultValue={country ?? ""}><option value="">Not provided</option>{Object.entries(COUNTRY_NAMES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
    <p className="text-xs text-[var(--muted)]">A label or country helps identify a device; it is not proof of identity or location.</p>
    <button className="btn btn-secondary" disabled={busy}>Save device details</button>{status && <p role="status">{status}</p>}
  </form></details>;
}
