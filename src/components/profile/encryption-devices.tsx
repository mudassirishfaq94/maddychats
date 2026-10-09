"use client";
import { useCallback, useEffect, useState } from "react";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { e2eeRequest } from "@/lib/e2ee-request";

type Device = { deviceId: string; trustedAt: string | null; publicKey: string; fingerprint: string };
export function EncryptionDevices() {
  const encryption = useSharedE2EE();
  const [devices, setDevices] = useState<Device[]>([]);
  const [verified, setVerified] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const { waitForDeviceRegistration } = encryption;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    await waitForDeviceRegistration();
    const response = await e2eeRequest("/api/e2ee/keys", { cache: "no-store", signal });
    if (!response.ok) throw new Error("Unable to load encryption devices.");
    const data = await response.json() as { keys: Omit<Device, "fingerprint">[] };
    const rows = await Promise.all(data.keys.map(async device => {
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(device.publicKey));
      return { ...device, fingerprint: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("") };
    }));
    setDevices(rows);
  }, [waitForDeviceRegistration]);
  useEffect(() => {
    if (!encryption.initialized) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void refresh(controller.signal).catch(cause => {
      if (!controller.signal.aborted) setStatus(cause instanceof Error ? cause.message : "Unable to load devices.");
    }), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [encryption.initialized, refresh]);
  const current = devices.find(device => device.deviceId === encryption.deviceId);
  return <section className="card-flat rounded-2xl p-5">
    <h2 className="font-semibold">Encryption devices</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">Approve a new device from a trusted device, then open the chat there and use Restore my other devices. Reload the new device after approval.</p>
    {current && <div className="mt-3 text-sm"><p>This device: {current.trustedAt ? "Trusted" : "Waiting for approval"}</p><p className="mt-1 text-xs">Device ID: {current.deviceId}</p><code className="mt-1 block break-all select-all text-xs" aria-label="This device fingerprint">{current.fingerprint}</code></div>}
    {encryption.error && <p role="alert" className="mt-2 text-sm">{encryption.error}</p>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    <ul className="mt-3 space-y-3">{devices.filter(device => !device.trustedAt && device.deviceId !== encryption.deviceId).map(device => <li key={device.deviceId} className="border-t border-[var(--border)] pt-3">
      <p className="text-sm break-all">New device: {device.deviceId}</p>
      <code className="mt-1 block break-all select-all text-xs">{device.fingerprint}</code>
      <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={verified.includes(device.deviceId)} onChange={event => setVerified(previous => event.target.checked ? [...previous, device.deviceId] : previous.filter(id => id !== device.deviceId))} />I compared this fingerprint with Profile on my new device and they match.</label>
      <button type="button" className="btn-secondary mt-2" disabled={busy || !current?.trustedAt || !verified.includes(device.deviceId)} onClick={() => {
        setBusy(true); setStatus("");
        void encryption.approveDevice(device.deviceId, device.fingerprint).then(async () => { await refresh(); setVerified([]); setStatus("Device approved. Restore each chat from a device that can already read it, then reload the new device."); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Approval failed.")).finally(() => setBusy(false));
      }}>Approve encryption device</button>
    </li>)}</ul>
    <button type="button" className="btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => void refresh().catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to load devices."))}>Refresh encryption devices</button>
    <p className="mt-3 text-xs text-[var(--muted)]">Clearing all browser data removes local keys and drafts. If no trusted device retains a message key, we cannot recover that message.</p>
  </section>;
}
