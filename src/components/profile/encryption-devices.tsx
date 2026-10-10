"use client";
import { useCallback, useEffect, useState } from "react";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { e2eeRequest } from "@/lib/e2ee-request";

type Device = { deviceId: string; trustedAt: string | null; publicKey: string; fingerprint: string };
type LinkRequest = { id: string; deviceId: string; fingerprint: string; status: string; expiresAt: string };
export function EncryptionDevices() {
  const encryption = useSharedE2EE();
  const [devices, setDevices] = useState<Device[]>([]);
  const [verified, setVerified] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<LinkRequest[]>([]);
  const [linkCode, setLinkCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
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
    const linkResponse = await e2eeRequest("/api/e2ee/devices/link", { cache: "no-store", signal });
    if (!linkResponse.ok) throw new Error("Unable to refresh linking requests.");
    const linkData = await linkResponse.json() as { requests: LinkRequest[] };
    setLinks(linkData.requests); setDevices(rows);
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
  useEffect(() => {
    if (!linkCode || current?.trustedAt) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) void refresh(controller.signal).catch(() => {});
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [linkCode, current?.trustedAt, busy, refresh]);
  return <section id="encryption-devices" className="card-flat rounded-2xl p-5">
    <h2 className="font-semibold">Encryption devices</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">Approve a new device from a trusted device, then open the chat there and use Restore my other devices. Reload the new device after approval.</p>
    {current && <div className="mt-3 text-sm"><p>This device: {current.trustedAt ? "Trusted" : "Waiting for approval"}</p><p className="mt-1 text-xs">Device ID: {current.deviceId}</p><code className="mt-1 block break-all select-all text-xs" aria-label="This device fingerprint">{current.fingerprint}</code></div>}
    {current && !current.trustedAt && <p className="mt-3 text-sm text-[var(--muted)]">This browser cannot approve devices. Open Profile on a device marked Trusted and compare the fingerprint shown here.</p>}
    {current && !current.trustedAt && <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => {
        setBusy(true); setStatus("Creating a device linking code…");
        void e2eeRequest("/api/e2ee/devices/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: encryption.deviceId }) }).then(async response => {
          const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to request linking.");
          setLinkCode(data.code); setExpiresAt(data.expiresAt); await refresh(); setStatus("Compare fingerprints, then enter this code on your trusted device.");
        }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to request linking.")).finally(() => setBusy(false));
      }}>Request device linking</button>
      {linkCode && <p className="mt-2 text-sm">Linking code: <code aria-label="Device linking code" className="select-all break-all">{linkCode}</code><br />Expires at {new Date(expiresAt).toLocaleTimeString()}. Never share this code with someone else.</p>}
      {links.filter(link => link.deviceId === encryption.deviceId).map(link => <p key={link.id} className="mt-2 text-sm" role="status">Linking request: {link.status}</p>)}
    </div>}
    {encryption.error && !current?.trustedAt && <p role="status" className="mt-2 text-sm">{encryption.error}</p>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    <ul className="mt-3 space-y-3">{devices.filter(device => !device.trustedAt && device.deviceId !== encryption.deviceId).map(device => <li key={device.deviceId} className="border-t border-[var(--border)] pt-3">
      <p className="text-sm break-all">New device: {device.deviceId}</p>
      <code className="mt-1 block break-all select-all text-xs">{device.fingerprint}</code>
      {links.filter(link => link.deviceId === device.deviceId && link.status === "pending").map(link => <div key={link.id} className="mt-2">
        <label className="text-xs">Code displayed on the new device<input aria-label={`Linking code for ${device.deviceId}`} className="field-input mt-1 w-full" maxLength={24} value={codes[link.id] ?? ""} onChange={event => setCodes(previous => ({ ...previous, [link.id]: event.target.value }))} /></label>
        <button className="btn btn-secondary mt-2" type="button" disabled={busy || !current?.trustedAt} onClick={() => {
          setBusy(true); setStatus("Rejecting device linking…");
          void encryption.approveDevice(device.deviceId, device.fingerprint, { linkId: link.id, decision: "reject" }).then(async () => { await refresh(); setStatus("Device linking rejected. No encryption access was granted."); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to reject linking.")).finally(() => setBusy(false));
        }}>Reject device linking</button>
      </div>)}
      <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={verified.includes(device.deviceId)} onChange={event => setVerified(previous => event.target.checked ? [...previous, device.deviceId] : previous.filter(id => id !== device.deviceId))} />I compared this fingerprint with Profile on my new device and they match.</label>
      <button type="button" className="btn btn-secondary mt-2" disabled={busy || !current?.trustedAt || !verified.includes(device.deviceId)} onClick={() => {
        setBusy(true); setStatus("");
        const link = links.find(link => link.deviceId === device.deviceId && link.status === "pending");
        void encryption.approveDevice(device.deviceId, device.fingerprint, link ? { linkId: link.id, code: codes[link.id] ?? "", decision: "approve" } : undefined).then(async () => { await refresh(); setVerified([]); setStatus("Device approved. Restore each chat from a device that can already read it, then reload the new device."); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Approval failed.")).finally(() => setBusy(false));
      }}>Approve encryption device</button>
    </li>)}</ul>
    <button type="button" className="btn btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => { setBusy(true); setStatus("Checking device approval…"); void refresh().then(() => { setStatus("Encryption devices refreshed."); window.dispatchEvent(new Event("maddy:message-request-keys")); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to load devices.")).finally(() => setBusy(false)); }}>{busy ? "Checking devices…" : "Refresh encryption devices"}</button>
    <p className="mt-3 text-xs text-[var(--muted)]">Clearing all browser data removes local keys and drafts. If no trusted device retains a message key, we cannot recover that message.</p>
  </section>;
}
