"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { e2eeRequest } from "@/lib/e2ee-request";
import { DeviceIdentityEditor } from "./device-identity-editor";
import { DeviceRecovery } from "./device-recovery";
import { browserLabel, countryName } from "@/server/device-meta";
import { FreshAuthentication } from "./fresh-authentication";

type Device = { deviceId: string; trustedAt: string | null; publicKey: string; fingerprint: string; browser: string | null; sessionExpiresAt: string | null; sessionRevokedAt: string | null; lastUsedAt: string | null; sessionState: string; deviceName?: string | null; country?: string | null; platform?: string | null; };
type LinkRequest = { id: string; deviceId: string; fingerprint: string; status: string; expiresAt: string };

export function EncryptionDevices() {
  const encryption = useSharedE2EE();
  const [devices, setDevices] = useState<Device[]>([]);
  const [verified, setVerified] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<LinkRequest[]>([]);
  const [issued, setIssued] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const { waitForDeviceRegistration, syncKnownConversations } = encryption;
  const knownTrusted = useRef<Set<string> | null>(null);

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
    setLinks(linkData.requests);
    setDevices(rows);
    const trusted = new Set(rows.filter(row => row.trustedAt).map(row => row.deviceId));
    const added = knownTrusted.current && [...trusted].some(id => !knownTrusted.current!.has(id));
    const currentJustApproved = knownTrusted.current && !knownTrusted.current.has(encryption.deviceId) && trusted.has(encryption.deviceId);
    knownTrusted.current = trusted;
    if (currentJustApproved) { window.location.reload(); return; }
    if (added && trusted.has(encryption.deviceId)) {
      setStatus("Device linked. Synchronizing existing chat keys…");
      void syncKnownConversations().then(summary => setStatus("Device approved. " + summary)).catch(cause => setStatus(cause instanceof Error ? cause.message : "Retry key synchronization."));
    }
  }, [waitForDeviceRegistration, encryption.deviceId, syncKnownConversations]);

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
    if (!current || (current.trustedAt && !Object.values(issued).some(item => new Date(item.expiresAt).getTime() > Date.now()))) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) void refresh(controller.signal).catch(() => {});
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [current, busy, refresh, issued]);

  /** A trusted device mints a short-lived code that names one target device. */
  function generateCode(targetDeviceId: string) {
    setBusy(true);
    setStatus("Creating a linking code…");
    void e2eeRequest("/api/e2ee/devices/link/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: targetDeviceId }),
    }).then(async response => {
      const data = await response.json() as { id?: string; code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.code || !data.expiresAt) throw new Error(data.error ?? "Unable to create a linking code.");
      setIssued(previous => ({ ...previous, [targetDeviceId]: { code: data.code as string, expiresAt: data.expiresAt as string } }));
      setStatus("Type this code on the other device within 10 minutes. It works once.");
    }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to create a linking code.")).finally(() => setBusy(false));
  }

  /** The new device redeems the code generated on a trusted device. */
  function redeemCode() {
    setBusy(true);
    setStatus("Checking the linking code…");
    void e2eeRequest("/api/e2ee/devices/link/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceId: encryption.deviceId, ...(deviceName.trim() ? { deviceName: deviceName.trim() } : {}) }),
    }).then(async response => {
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to link this device.");
      setCode("");
      setDeviceName("");
      await refresh();
      setStatus("This device is trusted. Reload to resume secure sending, then restore each chat from a device that can already read it.");
      window.dispatchEvent(new Event("maddy:message-request-keys"));
    }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to link this device.")).finally(() => setBusy(false));
  }

  return <section id="encryption-devices" className="card-flat rounded-2xl p-5">
    <h2 className="font-semibold">Encryption devices</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">Use a one-time linking code from a trusted browser. Keep that browser open while existing chat keys synchronize. Save a recovery file so you can recover without resetting everyone else.</p>
    {current && <div className="mt-3 text-sm"><p>This device: {current.trustedAt ? "Trusted" : "Waiting for approval"}</p><p className="mt-1 text-xs">Device ID: {current.deviceId}</p>{current.deviceName ? <p className="mt-1 text-xs text-[var(--muted)]">Device name: {current.deviceName}</p> : null}<p className="mt-1 text-xs text-[var(--muted)]">Country: {current.country ? countryName(current.country) : "Not provided — set Country in your profile"}</p><code className="mt-1 block break-all select-all text-xs" aria-label="This device fingerprint">{current.fingerprint}</code></div>}
    {current && !current.trustedAt && <p className="mt-3 text-sm text-[var(--muted)]">This browser cannot approve devices. Open Profile on a device marked Trusted and compare the fingerprint shown here.</p>}
    <p className="mt-3 text-sm text-[var(--muted)]">Trust belongs to this account and this browser&apos;s saved encryption key, not the laptop or phone itself. Signing in again in the same browser keeps its approval; a different browser, a different website address, or clearing browser storage creates a new device that needs linking once. Approval permits key sharing; it does not mean every chat key has synchronized.</p>
    <h3 className="mt-4 text-sm font-semibold">Trusted devices for this account</h3>
    {devices.some(device => device.trustedAt) ? <ul className="mt-2 space-y-3">{devices.filter(device => device.trustedAt).map(device => <li key={device.deviceId} className="rounded-xl border border-[var(--border)] p-3 text-xs">
      <p className="font-semibold">{device.deviceId === encryption.deviceId ? "This browser — Trusted" : "Trusted encryption key"}</p>
      <p className="mt-1 break-all">Device ID: {device.deviceId}</p>
      <p className="mt-1 break-words">{(device.deviceName ?? browserLabel(device.browser) ?? device.platform) || "Older registration: browser information unavailable. Match this ID on your original browser."}</p>
      {device.country ? <p className="mt-1 text-xs text-[var(--muted)]">Country: {countryName(device.country)}</p> : null}
      <p className="mt-1">Last key use: {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleString() : "Not recorded"}</p>
      <p className="mt-1">{device.sessionRevokedAt ? "Session revoked. This key cannot be used until you sign in and refresh its status." : device.sessionState === "expired" ? "Session expired. Sign in again on the original browser." : "Can approve only from the browser that still holds this private key."}</p>
    </li>)}</ul> : <p className="mt-2 text-sm">No trusted encryption device is registered for this account. Use secure recovery below to enroll this browser.</p>}
    {current && <DeviceIdentityEditor key={current.deviceId} deviceId={current.deviceId} name={current.deviceName} country={current.country} onSaved={refresh} />}
    <DeviceRecovery />
    {current && !current.trustedAt && <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRecoveryOpen(previous => !previous)}>Emergency recovery: no trusted device or recovery file</button>
      {recoveryOpen && <div className="mt-3 text-sm">
        <p>First try the original browser where this account&apos;s chats still open. If its keys are gone, securely enroll this browser after confirming your identity. This signs out all other browsers and removes their encryption approval; sign in and approve them again individually.</p>
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
    {current && !current.trustedAt && <div className="mt-3 rounded-xl border border-[var(--border)] p-3 text-sm">
      <p className="font-semibold">Enter the linking code from your trusted device</p>
      <p className="mt-1 text-xs text-[var(--muted)]">On a device marked Trusted, open Profile &gt; Encryption devices and choose Generate linking code for this device. The code expires after 10 minutes and can be used once.</p>
      <label className="mt-3 block text-xs">Linking code<input className="field-input mt-1 w-full tracking-[0.3em]" aria-label="Device linking code" autoComplete="off" maxLength={12} value={code} onChange={event => setCode(event.target.value)} /></label>
      <label className="mt-2 block text-xs">Name this device (optional)<input className="field-input mt-1 w-full" aria-label="This device name" maxLength={60} value={deviceName} onChange={event => setDeviceName(event.target.value)} placeholder="e.g. Work laptop — Chrome" /></label>
      <button type="button" className="btn btn-secondary mt-3" disabled={busy || code.trim().length < 8} onClick={redeemCode}>Link this device</button>
      {links.filter(link => link.deviceId === encryption.deviceId).map(link => <p key={link.id} className="mt-2 text-xs text-[var(--muted)]" role="status">Linking request: {link.status}</p>)}
    </div>}
    {encryption.error && !current?.trustedAt && <p role="status" className="mt-2 text-sm">{encryption.error}</p>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
    <ul className="mt-3 space-y-3">{devices.filter(device => !device.trustedAt && device.deviceId !== encryption.deviceId).map(device => <li key={device.deviceId} className="border-t border-[var(--border)] pt-3">
      <p className="text-sm break-all">New device: {device.deviceId}</p>
      <code className="mt-1 block break-all select-all text-xs">{device.fingerprint}</code>
      <p className="mt-1 text-xs break-words">{(device.deviceName ?? browserLabel(device.browser) ?? device.platform) || "Browser not recorded"}</p>
      {device.country ? <p className="mt-1 text-xs text-[var(--muted)]">Country: {countryName(device.country)}</p> : null}
      <p className="mt-1 text-xs">{device.sessionRevokedAt ? "Signed out / revoked — sign in on that browser before linking." : "Waiting for approval — chat keys are not yet synchronized."}</p>
      {!current?.trustedAt && <p className="mt-2 text-xs text-[var(--muted)]">Approval is available on a trusted browser for this account. Use the device list above or secure recovery.</p>}
      {current?.trustedAt && <>
      <button type="button" className="btn btn-secondary mt-2" disabled={busy || !current?.trustedAt} onClick={() => generateCode(device.deviceId)}>Generate linking code</button>
      {issued[device.deviceId] && <p className="mt-2 text-sm" role="status">Linking code for this device: <code aria-label="Device linking code" className="select-all break-all font-semibold">{issued[device.deviceId].code}</code><br />Expires at {new Date(issued[device.deviceId].expiresAt).toLocaleTimeString()}. Type it on that device, then press Link this device there. Never share it with anyone else.</p>}
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
        void encryption.approveDevice(device.deviceId, device.fingerprint, link ? { linkId: link.id, code: codes[link.id] ?? "", decision: "approve" } : undefined).then(async () => { await refresh(); setVerified([]); setStatus("Device approved. Existing chat keys are synchronizing from this browser."); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Approval failed.")).finally(() => setBusy(false));
      }}>Approve encryption device</button>
      {!verified.includes(device.deviceId) && <p className="mt-1 text-xs text-[var(--muted)]">Compare the fingerprint on both browsers and check the box to enable approval.</p>}
      </>}
    </li>)}</ul>
    {current?.trustedAt && <button type="button" className="btn btn-secondary mt-3 mr-2" disabled={busy} onClick={() => { setBusy(true); setStatus("Synchronizing existing chat keys…"); void syncKnownConversations().then(setStatus).catch(error => setStatus(error.message)).finally(() => setBusy(false)); }}>Sync chat keys to linked devices</button>}
    <button type="button" className="btn btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => { setBusy(true); setStatus("Checking device approval…"); void refresh().then(() => { setStatus("Encryption devices refreshed."); window.dispatchEvent(new Event("maddy:message-request-keys")); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to load devices.")).finally(() => setBusy(false)); }}>{busy ? "Checking devices…" : "Refresh encryption devices"}</button>
    <p className="mt-3 text-xs text-[var(--muted)]">Clearing all browser data removes local keys and drafts. If no trusted device retains a message key, we cannot recover that message.</p>
  </section>;
}
