"use client";
import { useCallback, useEffect, useState } from "react";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { e2eeRequest } from "@/lib/e2ee-request";
import { FreshAuthentication } from "./fresh-authentication";

type Device = { deviceId: string; trustedAt: string | null; publicKey: string; fingerprint: string; browser: string | null; sessionExpiresAt: string | null; sessionRevokedAt: string | null; lastUsedAt: string | null; sessionState: string };
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
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
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
    if (!current || current.trustedAt) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) void refresh(controller.signal).catch(() => {});
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [current, busy, refresh]);
  return <section id="encryption-devices" className="card-flat rounded-2xl p-5">
    <h2 className="font-semibold">Encryption devices</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">Approve a new device from a trusted device, then open the chat there and use Restore my other devices. Reload the new device after approval.</p>
    {current && <div className="mt-3 text-sm"><p>This device: {current.trustedAt ? "Trusted" : "Waiting for approval"}</p><p className="mt-1 text-xs">Device ID: {current.deviceId}</p><code className="mt-1 block break-all select-all text-xs" aria-label="This device fingerprint">{current.fingerprint}</code></div>}
    {current && !current.trustedAt && <p className="mt-3 text-sm text-[var(--muted)]">This browser cannot approve devices. Open Profile on a device marked Trusted and compare the fingerprint shown here.</p>}
    <p className="mt-3 text-sm text-[var(--muted)]">Trust belongs to this account and this browser&apos;s saved encryption key, not the laptop or phone itself. Signing into another account or clearing browser storage can create a different device. Approval permits key sharing; it does not mean every chat key has synchronized.</p>
    <h3 className="mt-4 text-sm font-semibold">Trusted devices for this account</h3>
    {devices.some(device => device.trustedAt) ? <ul className="mt-2 space-y-3">{devices.filter(device => device.trustedAt).map(device => <li key={device.deviceId} className="rounded-xl border border-[var(--border)] p-3 text-xs">
      <p className="font-semibold">{device.deviceId === encryption.deviceId ? "This browser — Trusted" : "Trusted encryption key"}</p>
      <p className="mt-1 break-all">Device ID: {device.deviceId}</p>
      <p className="mt-1 break-words">{device.browser || "Older registration: browser information unavailable. Match this ID on your original browser."}</p>
      <p className="mt-1">Last key use: {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleString() : "Not recorded"}</p>
      <p className="mt-1">{device.sessionRevokedAt ? "Session revoked. This key cannot be used until you sign in and refresh its status." : device.sessionState === "expired" ? "Session expired. Sign in again on the original browser." : "Can approve only from the browser that still holds this private key."}</p>
    </li>)}</ul> : <p className="mt-2 text-sm">No trusted encryption device is registered for this account. Use secure recovery below to enroll this browser.</p>}
    {current && !current.trustedAt && <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRecoveryOpen(previous => !previous)}>I cannot access a trusted device</button>
      {recoveryOpen && <div className="mt-3 text-sm">
        <p>First try the original browser where this account&apos;s chats still open. If its keys are gone, securely enroll this browser after confirming your identity. This removes encryption approval from all older devices; approve them again individually.</p>
        <p className="mt-2">Old messages stay encrypted and are not deleted. Lost private keys cannot be recovered by signing in. A participant who can still read the chat must verify your changed encryption identity and send an encrypted reply. Alternatively, re-approve an original browser that still has its keys, then use Restore my other devices there. New conversations can start after recovery; existing chats may remain waiting for key synchronization.</p>
        <FreshAuthentication password={password} code={mfaCode} onPassword={setPassword} onCode={setMfaCode} returnTo="/app/profile#encryption-devices" />
        <label className="block text-xs">Type RESET ENCRYPTION TRUST to confirm<input className="field-input mt-1 w-full" aria-label="Encryption recovery confirmation" value={confirmation} maxLength={30} onChange={event => setConfirmation(event.target.value)} /></label>
        <button type="button" className="btn btn-secondary mt-3" disabled={busy || confirmation !== "RESET ENCRYPTION TRUST"} onClick={() => {
          setBusy(true); setStatus("Verifying identity and this browser's private key…");
          void encryption.approveDevice(current.deviceId, current.fingerprint, { decision: "recover", confirmation, password, mfaCode }).then(async () => {
            setPassword(""); setMfaCode(""); setConfirmation(""); setRecoveryOpen(false); await refresh();
            setStatus("This browser is trusted. Reload to resume secure sending. Existing chats still need their original keys restored from a participant or browser that can read them.");
            window.dispatchEvent(new Event("maddy:message-request-keys"));
          }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Recovery could not be verified.")).finally(() => setBusy(false));
        }}>Recover encryption on this browser</button>
      </div>}
    </div>}
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
      <p className="mt-1 text-xs break-words">{device.browser || "Browser not recorded"}</p>
      <p className="mt-1 text-xs">{device.sessionRevokedAt ? "Signed out / revoked — sign in on that browser before linking." : "Pending approval — chat keys are not yet synchronized."}</p>
      {!current?.trustedAt && <p className="mt-2 text-xs text-[var(--muted)]">Approval is available on a trusted browser for this account. Use the device list above or secure recovery.</p>}
      {current?.trustedAt && <>
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
      {!verified.includes(device.deviceId) && <p className="mt-1 text-xs text-[var(--muted)]">Compare the fingerprint on both browsers and check the box to enable approval.</p>}
      </>}
    </li>)}</ul>
    <button type="button" className="btn btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => { setBusy(true); setStatus("Checking device approval…"); void refresh().then(() => { setStatus("Encryption devices refreshed."); window.dispatchEvent(new Event("maddy:message-request-keys")); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to load devices.")).finally(() => setBusy(false)); }}>{busy ? "Checking devices…" : "Refresh encryption devices"}</button>
    <p className="mt-3 text-xs text-[var(--muted)]">Clearing all browser data removes local keys and drafts. If no trusted device retains a message key, we cannot recover that message.</p>
  </section>;
}
