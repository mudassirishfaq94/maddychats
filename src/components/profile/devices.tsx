"use client";
import { useEffect, useState } from "react";
import { FreshAuthentication } from "./fresh-authentication";
import { navigateWithReload } from "@/lib/navigation";

type Device = { id: string; userAgent: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean };
export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/privacy/devices", { signal: controller.signal }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Unable to load devices.");
      setDevices(data.devices); setLegacy(data.legacy); setLoading(false);
    }).catch((err: Error) => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, []);
  async function revoke(id?: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/privacy/devices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(id ? { id } : { allOthers: true }), password, mfaCode: code }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Unable to revoke device.");
      setPassword(""); setCode("");
      if (devices.find((device) => device.id === id)?.current) { navigateWithReload("/login"); return; }
      setDevices((previous) => previous.filter((device) => id ? device.id !== id : device.current));
    } catch (err) { setError(err instanceof Error ? err.message : "Network error."); }
    finally { setBusy(false); }
  }
  return <section className="card-flat rounded-2xl p-5">
    <h2 className="font-semibold">Signed-in devices</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">Remove a device to end its session. Signing out ends all sessions.</p>
    {legacy && <p className="mt-2 text-sm">Sign in again to register this browser as a device.</p>}
    <FreshAuthentication password={password} code={code} onPassword={setPassword} onCode={setCode} />
    {loading && <p role="status">Loading devices…</p>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <ul className="space-y-3">{devices.map((device) => <li key={device.id} className="flex gap-3 items-center justify-between border-t border-[var(--border)] pt-3">
      <div className="min-w-0"><p className="text-sm break-words">{device.userAgent}{device.current ? " · This device" : ""}</p><p className="text-xs text-[var(--muted)]">Last renewed {new Date(device.lastSeenAt).toLocaleString()}</p></div>
      <button type="button" className="btn-secondary shrink-0 text-sm" disabled={busy} onClick={() => void revoke(device.id)}>Sign out</button>
    </li>)}</ul>
    <button type="button" className="btn-secondary mt-4" disabled={busy || legacy || !devices.some((device) => !device.current)} onClick={() => void revoke()}>Sign out other devices</button>
  </section>;
}
