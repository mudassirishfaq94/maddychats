"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { e2eeRequest } from "@/lib/e2ee-request";
import { DeviceIdentityEditor } from "./device-identity-editor";
import { CloudRecoverySettings } from "./cloud-recovery";
import { DeviceRecovery } from "./device-recovery";
import dynamic from "next/dynamic";
const LocalChatBackupSettings = dynamic(() => import("./local-chat-backup").then(module => module.LocalChatBackupSettings));
function BackupRestoreOption() {
  const [open, setOpen] = useState(false);
  return <details className="mt-4 rounded-xl border border-[var(--border)] p-3" onToggle={event => setOpen(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Restore a saved backup instead</summary>{open ? <LocalChatBackupSettings restoreOnly /> : null}</details>;
}
import { browserLabel, countryName } from "@/server/device-meta";
import { FreshAuthentication } from "./fresh-authentication";
import { DeviceLinkQr } from "./device-link-qr";
import { DeviceLinkScanner } from "./device-link-scanner";
import { createDeviceLinkQrPayload, parseDeviceLinkQrPayload } from "@/lib/device-link-qr";
import Link from "next/link";

type Device = { deviceId: string; trustedAt: string | null; publicKey: string; fingerprint: string; browser: string | null; sessionExpiresAt: string | null; sessionRevokedAt: string | null; lastUsedAt: string | null; sessionState: string; deviceName?: string | null; country?: string | null; platform?: string | null; };
type LinkRequest = { id: string; deviceId: string; fingerprint: string; status: string; expiresAt: string };

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your verified email";
  return `${local.slice(0, 1)}${local.length > 1 ? "•••" : "••"}@${domain}`;
}

export function EncryptionDevices({ recoveryEmail, openRecovery = false, setup = false, hideBackups = false, onLinked, returnTo = "/app/settings#privacy" }: { recoveryEmail?: string; openRecovery?: boolean; setup?: boolean; hideBackups?: boolean; onLinked?: () => void; returnTo?: string }) {
  const encryption = useSharedE2EE();
  const [setupChoice,setSetupChoice]=useState<"link"|"file"|null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [verified, setVerified] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<LinkRequest[]>([]);
  const [issuedQr, setIssuedQr] = useState<{ deviceId: string; payload: string; expiresAt: string } | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [scannedLink, setScannedLink] = useState<{ requestId: string; token: string } | null>(null);
  const [status, setStatus] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(openRecovery);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [emailRecoveryCode, setEmailRecoveryCode] = useState("");
  const [emailRecoveryCodeSent, setEmailRecoveryCodeSent] = useState(false);
  const [recoveryReadiness, setRecoveryReadiness] = useState<{ configured: boolean; recentSignIn: boolean } | null>(null);
  const { waitForDeviceRegistration, syncKnownConversations } = encryption;
  const knownLinked = useRef<Set<string> | null>(null);

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
    const added = knownLinked.current && [...trusted].some(id => !knownLinked.current!.has(id));
    const currentJustApproved = knownLinked.current && !knownLinked.current.has(encryption.deviceId) && trusted.has(encryption.deviceId);
    knownLinked.current = trusted;
    if (currentJustApproved) { window.location.reload(); return { devices: rows, requests: linkData.requests }; }
    if (added && trusted.has(encryption.deviceId)) {
      setStatus("Device linked. Synchronizing existing chat keys…");
      void syncKnownConversations().then(summary => setStatus("Device approved. " + summary)).catch(cause => setStatus(cause instanceof Error ? cause.message : "Retry key synchronization."));
    }
    return { devices: rows, requests: linkData.requests };
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
    if (!issuedQr) return;
    const timer = window.setTimeout(() => setQrExpired(true), Math.max(0, Date.parse(issuedQr.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [issuedQr]);

  useEffect(() => { if (current?.trustedAt) onLinked?.(); }, [current?.trustedAt, onLinked]);

  useEffect(() => {
    if (!recoveryOpen || !recoveryEmail) return;
    const controller = new AbortController();
    void e2eeRequest("/api/e2ee/devices/recovery-email", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (response.ok) setRecoveryReadiness(await response.json()); })
      .catch(() => {});
    return () => controller.abort();
  }, [recoveryOpen, recoveryEmail]);

  async function sendRecoveryEmailCode() {
    if (!current || !current.fingerprint) return;
    setBusy(true);
    setStatus("Sending a one-time recovery code to your verified email…");
    try {
      const response = await e2eeRequest("/api/e2ee/devices/recovery-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: current.deviceId, fingerprint: current.fingerprint, password, mfaCode }),
      });
      const data = await response.json() as { error?: string; code?: string; expiresInSeconds?: number };
      if (data.code === "REAUTH_REQUIRED") setRecoveryReadiness(previous => ({ configured: previous?.configured ?? true, recentSignIn: false }));
      if (!response.ok) throw new Error(data.error ?? "Unable to send a recovery code.");
      setEmailRecoveryCodeSent(true);
      setStatus("Recovery email submitted. Check your inbox and spam folder. The code expires in 10 minutes and works once.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Unable to send a recovery code.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!current || (current.trustedAt && (!issuedQr || new Date(issuedQr.expiresAt).getTime() <= Date.now()))) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) void refresh(controller.signal).catch(() => {});
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [current, busy, refresh, issuedQr]);

  async function createLinkQr(targetDeviceId: string) {
    setBusy(true);
    setStatus("Preparing a secure device-link QR code…");
    try {
      const response = await e2eeRequest("/api/e2ee/devices/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: targetDeviceId }) });
      const data = await response.json() as { id?: string; token?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.id || !data.token || !data.expiresAt) throw new Error(data.error ?? "Unable to create a secure QR code.");
      const payload = createDeviceLinkQrPayload(data.id, data.token);
      setIssuedQr({ deviceId: targetDeviceId, payload, expiresAt: data.expiresAt });
      setQrExpired(false);
      setStatus("On your linked device, scan this QR and compare the safety number before approval.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Unable to create a secure QR code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleScannedPayload(raw: string) {
    const payload = parseDeviceLinkQrPayload(raw);
    if (!payload) { setStatus("This is not a valid Circlo device-link QR code."); return; }
    setBusy(true);
    setStatus("Checking this device-link request…");
    try {
      const snapshot = await refresh();
      const request = snapshot?.requests.find(item => item.id === payload.requestId && item.status === "pending");
      const target = snapshot?.devices.find(device => device.deviceId === request?.deviceId && !device.trustedAt);
      if (!request || !target || request.fingerprint !== target.fingerprint || new Date(request.expiresAt).getTime() <= Date.now()) throw new Error("This QR code has expired or no longer matches a pending device request. Create a new one and scan again.");
      setVerified([]);
      setScannedLink({ requestId: payload.requestId, token: payload.token });
      setStatus("Compare the safety number shown here with the new device before approving.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Unable to verify this QR code.");
    } finally {
      setBusy(false);
    }
  }

  if(setup) return <section className="card-flat rounded-2xl p-4" aria-label="Set up this phone">
    <h2 className="font-semibold">Open your chats on this phone</h2>
    {!current ? <p role="status" className="mt-3 text-sm">Getting this phone ready…</p> : current.trustedAt ? <p role="status" className="mt-3 text-sm">Opening your chats…</p> : !setupChoice ? <div className="mt-4 grid gap-3">
      <button type="button" className="btn btn-primary min-h-12 w-full" onClick={()=>{setSetupChoice("link");void createLinkQr(current.deviceId);}}>I still have my old phone</button>
      <button type="button" className="btn btn-secondary min-h-12 w-full" onClick={()=>{setSetupChoice("file");setRecoveryOpen(true);}}>I saved a recovery file</button>
    </div> : <div className="mt-4"><button type="button" className="min-h-11 text-sm underline" onClick={()=>{setSetupChoice(null);setRecoveryOpen(false);setStatus("");}}>Back</button>
      {setupChoice==="link" ? <><p className="text-sm">On your old phone, open Settings → Privacy → Linked phones and account security. Scan this code and confirm it’s your new phone.</p>{issuedQr?.deviceId===current.deviceId && !qrExpired ? <DeviceLinkQr payload={issuedQr.payload} expiresAt={issuedQr.expiresAt}/> : <button type="button" disabled={busy} className="btn btn-secondary mt-3" onClick={()=>void createLinkQr(current.deviceId)}>Show QR code</button>}<details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">Check this phone’s number</summary><code aria-label="This device safety number" className="block break-all text-xs">{current.fingerprint}</code></details></> : <><LocalChatBackupSettings restoreOnly/><details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">More help with a saved file</summary><DeviceRecovery restoreOnly/>        <h3 className="font-semibold">Recover with email</h3>
        {recoveryEmail ? <>
          <p className="mt-2 text-sm">{maskEmail(recoveryEmail)}</p>
          {recoveryReadiness?.recentSignIn === false ? <p className="mt-2 text-sm">For your safety, <Link className="underline" href={`/login?reauth=1&next=${encodeURIComponent(returnTo)}`}>sign in again</Link> before requesting a code.</p> : null}
          {recoveryReadiness?.configured === false ? <p className="mt-2 text-sm" role="status">Email recovery is unavailable. Try again later or contact support.</p> : null}
          <button type="button" className="btn btn-secondary mt-3 min-h-11 w-full" disabled={busy || recoveryReadiness?.configured === false || recoveryReadiness?.recentSignIn === false} onClick={() => void sendRecoveryEmailCode()}>{busy ? "Please wait…" : emailRecoveryCodeSent ? "Send another code" : "Send recovery code"}</button>
          <label className="mt-3 block text-sm">Code from your email<input className="field-input mt-1 w-full tracking-[0.3em]" aria-label="Email recovery code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailRecoveryCode} onChange={event => setEmailRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <button type="button" className="btn btn-primary mt-3 min-h-11 w-full" disabled={busy || emailRecoveryCode.length !== 6} onClick={() => {
              setBusy(true); setStatus("Verifying your code…");
              void encryption.approveDevice(current.deviceId, current.fingerprint, { decision: "recover", confirmation: "RESET ENCRYPTION TRUST", password, mfaCode, emailCode: emailRecoveryCode }).then(async () => {
                setPassword(""); setMfaCode(""); setEmailRecoveryCode(""); setConfirmation(""); setRecoveryOpen(false); await refresh();
                setStatus("This phone is set up. Older chats may need a linked phone to restore.");
                window.dispatchEvent(new Event("maddy:message-request-keys"));
              }).catch(cause => setStatus(cause instanceof Error ? cause.message : "We couldn’t verify that code. Try again.")).finally(() => setBusy(false));
          }}>Verify code and sign out other devices</button>
          {status ? <p role="status" className="mt-2 text-sm">{status}</p> : null}
          <p className="mt-2 text-xs text-[var(--muted)]">This restores your account access. Older messages may need a linked phone.</p>
        </> : <p className="mt-2 text-sm" role="status">No verified email is available for recovery. Contact support to regain account access.</p>}</details></>}
      {status ? <p role="status" className="mt-3 text-sm">{status}</p>:null}
    </div>}
  </section>;
  return <section id="encryption-devices" className="card-flat rounded-2xl p-3 sm:p-5">
    {!setup || !recoveryOpen ? <h2 className="font-semibold">{setup ? "Set up private chats" : "Encryption devices"}</h2> : null}
    {!setup || !recoveryOpen ? <p className="mt-1 text-sm text-[var(--muted)]">{setup ? current ? current.trustedAt ? "This device is ready. Opening Circlo…" : "Scan a QR from a linked device to use your existing account here." : "Checking this device…" : "Manage access to your private chats. Link a new device or save a recovery file when you need one."}</p> : null}
    {setup && current && !current.trustedAt && <div className="mt-4 grid gap-3">
      {recoveryOpen ? <div className="rounded-xl border border-[var(--border)] p-3">
        <button type="button" className="min-h-11 text-sm underline" onClick={() => { setRecoveryOpen(false); setStatus(""); }}>Back</button>
        <h3 className="font-semibold">Recover with email</h3>
        {recoveryEmail ? <>
          <p className="mt-2 text-sm">{maskEmail(recoveryEmail)}</p>
          {recoveryReadiness?.recentSignIn === false ? <p className="mt-2 text-sm">For your safety, <Link className="underline" href={`/login?reauth=1&next=${encodeURIComponent(returnTo)}`}>sign in again</Link> before requesting a code.</p> : null}
          {recoveryReadiness?.configured === false ? <p className="mt-2 text-sm" role="status">Email recovery is unavailable. Try again later or contact support.</p> : null}
          <button type="button" className="btn btn-secondary mt-3 min-h-11 w-full" disabled={busy || recoveryReadiness?.configured === false || recoveryReadiness?.recentSignIn === false} onClick={() => void sendRecoveryEmailCode()}>{busy ? "Please wait…" : emailRecoveryCodeSent ? "Send another code" : "Send recovery code"}</button>
          <label className="mt-3 block text-sm">Code from your email<input className="field-input mt-1 w-full tracking-[0.3em]" aria-label="Email recovery code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailRecoveryCode} onChange={event => setEmailRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <button type="button" className="btn btn-primary mt-3 min-h-11 w-full" disabled={busy || emailRecoveryCode.length !== 6} onClick={() => {
              setBusy(true); setStatus("Verifying your code…");
              void encryption.approveDevice(current.deviceId, current.fingerprint, { decision: "recover", confirmation: "RESET ENCRYPTION TRUST", password, mfaCode, emailCode: emailRecoveryCode }).then(async () => {
                setPassword(""); setMfaCode(""); setEmailRecoveryCode(""); setConfirmation(""); setRecoveryOpen(false); await refresh();
                setStatus("This phone is set up. Older chats may need a linked phone to restore.");
                window.dispatchEvent(new Event("maddy:message-request-keys"));
              }).catch(cause => setStatus(cause instanceof Error ? cause.message : "We couldn’t verify that code. Try again.")).finally(() => setBusy(false));
          }}>Verify code and sign out other devices</button>
          {status ? <p role="status" className="mt-2 text-sm">{status}</p> : null}
          <p className="mt-2 text-xs text-[var(--muted)]">This restores your account access. Older messages may need a linked phone.</p>
        </> : <p className="mt-2 text-sm" role="status">No verified email is available for recovery. Contact support to regain account access.</p>}
      </div> : <>
      <button type="button" className="btn btn-primary min-h-11 w-full" disabled={busy} onClick={() => void createLinkQr(current.deviceId)}>{issuedQr && issuedQr.deviceId === current.deviceId ? "Create a new QR code" : "Show a device-link QR code"}</button>
      {issuedQr?.deviceId === current.deviceId && !qrExpired ? <DeviceLinkQr payload={issuedQr.payload} expiresAt={issuedQr.expiresAt} /> : null}
      <button type="button" className="min-h-11 text-sm underline" onClick={() => { setStatus(""); setRecoveryOpen(true); }}>I don’t have my old device</button>
      </>}
    </div>}
    {!setup && current && !current.trustedAt && <div className="mt-4 rounded-xl border border-[var(--border)] p-3"><button type="button" className="btn btn-primary min-h-11 w-full" disabled={busy} onClick={() => void createLinkQr(current.deviceId)}>{issuedQr && issuedQr.deviceId === current.deviceId ? "Create a new QR code" : "Show a device-link QR code"}</button>{issuedQr?.deviceId === current.deviceId && !qrExpired ? <DeviceLinkQr payload={issuedQr.payload} expiresAt={issuedQr.expiresAt} /> : null}<p className="mt-2 text-xs text-[var(--muted)]">Keep this page open. Your linked device must scan the code and check the safety number.</p></div>}
    {!setup && current && <div className="mt-4 rounded-2xl bg-[var(--surface-2)] p-4 text-sm"><p className="font-semibold">This device: {current.trustedAt ? "Linked" : "Waiting for approval"}</p><p className="mt-1 text-[var(--muted)]">{current.trustedAt ? "Ready for private chats. You don’t need to do anything else." : "Link this device to access your private chats."}</p><p className="mt-2 text-xs text-[var(--muted)]">{current.deviceName || browserLabel(current.browser) || "This device"}{current.country ? ` · ${countryName(current.country)}` : ""}</p><details className="mt-3 text-xs"><summary className="cursor-pointer min-h-11 py-3">Device details</summary><p className="mt-2">Only compare this safety number when linking a device.</p><code className="mt-1 block break-all select-all" aria-label="This device safety number">{current.fingerprint}</code><DeviceIdentityEditor key={current.deviceId} deviceId={current.deviceId} name={current.deviceName} country={current.country} onSaved={async () => { await refresh(); }} /></details></div>}
    {setup && !recoveryOpen && current && !current.trustedAt && <details className="mt-3 text-xs"><summary className="min-h-11 cursor-pointer py-2">Show this device’s safety number</summary><p className="mt-2">Compare this number on both devices before approving.</p><code className="mt-1 block break-all select-all" aria-label="This device safety number">{current.fingerprint}</code></details>}
    {!setup && current?.trustedAt ? <DeviceLinkScanner onPayload={raw => void handleScannedPayload(raw)} /> : null}
    {!setup && current && !current.trustedAt && <p className="mt-3 text-sm text-[var(--muted)]">This browser cannot approve devices. Use a device marked Linked to link this one, or choose recovery below.</p>}

    {!setup && devices.some(device => device.trustedAt && device.deviceId !== encryption.deviceId && !device.sessionRevokedAt && device.sessionState !== "expired") && <details className="mt-4 rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer min-h-11 py-2 text-sm font-semibold">Other linked devices ({devices.filter(device => device.trustedAt && device.deviceId !== encryption.deviceId && !device.sessionRevokedAt && device.sessionState !== "expired").length})</summary><ul className="space-y-2">{devices.filter(device => device.trustedAt && device.deviceId !== encryption.deviceId && !device.sessionRevokedAt && device.sessionState !== "expired").map(device => <li key={device.deviceId} className="border-t border-[var(--border)] py-3 text-sm"><p className="font-medium">{device.deviceName || browserLabel(device.browser) || "Linked device"}</p><p className="mt-1 text-xs text-[var(--muted)]">Linked{device.country ? ` · ${countryName(device.country)}` : ""}{device.lastUsedAt ? ` · Last used ${new Date(device.lastUsedAt).toLocaleDateString()}` : ""}</p></li>)}</ul></details>}
    {!setup && !devices.some(device => device.trustedAt) && current && <p className="mt-3 text-sm">No linked device is available. Use a recovery file or account recovery below.</p>}
    {!setup && !hideBackups && <LocalChatBackupSettings />}
    {setup && recoveryOpen ? <BackupRestoreOption /> : null}
    {!setup && !hideBackups && <CloudRecoverySettings />}
    {!setup && !hideBackups && <details className="mt-4 rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer min-h-11 py-2 text-sm font-semibold">More ways to save</summary><DeviceRecovery /></details>}
    {!setup && current && !current.trustedAt && <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
      {!setup && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRecoveryOpen(previous => !previous)}>Emergency recovery: no linked device or backup file</button>}
      {recoveryOpen && <div className="mt-3 text-sm">
        <p>You will keep the same account. Recovery signs out your other devices and lets you use this one. Nothing is deleted from your account.</p>
        <p className="mt-2">An email code can&apos;t bring back old messages by itself. To read older chats, use a linked phone, a saved backup file, or a saved recovery code with its encrypted cloud backup if you set one up.</p>
        {recoveryEmail ? <div className="my-3 rounded-xl border border-[var(--border)] p-3">
          <p className="text-xs">Confirm your verified email: <strong>{maskEmail(recoveryEmail)}</strong></p>
          <p className="mt-1 text-xs text-[var(--muted)]">You must also have signed in again within the last five minutes. If needed, use the sign-in link below and choose Google.</p>
          {recoveryReadiness?.recentSignIn === false ? <div className="mt-2 rounded-lg bg-[var(--card-2)] p-3 text-xs"><p>For your safety, sign in again before requesting the code.</p><Link className="btn btn-secondary mt-2" href={`/login?reauth=1&next=${encodeURIComponent(returnTo)}`}>Confirm with Google or sign in again</Link></div> : null}
          {recoveryReadiness?.configured === false ? <p className="mt-2 text-xs">Email recovery isn&apos;t available right now. Use a saved backup file or another linked browser.</p> : null}
          <button type="button" className="btn btn-secondary mt-2" disabled={busy || recoveryReadiness?.configured === false || (recoveryReadiness?.recentSignIn === false && !password)} onClick={() => void sendRecoveryEmailCode()}>{busy ? "Please wait…" : emailRecoveryCodeSent ? "Send another recovery code" : "Send recovery code"}</button>
          {status ? <p role="status" className="mt-2 text-sm">{status}</p> : null}
          <label className="mt-3 block text-xs">Six-digit email recovery code<input className="field-input mt-1 w-full tracking-[0.3em]" aria-label="Email recovery code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailRecoveryCode} onChange={event => setEmailRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
        </div> : <p className="my-3 text-xs text-[var(--muted)]">{setup ? "Email recovery needs a verified email on this account. Use your saved recovery file above, or return to Settings and verify your email first." : "This account has no verified email available for recovery. Use the password and recent sign-in options below, or verify an email in account settings first."}</p>}
        {!setup && <FreshAuthentication password={password} code={mfaCode} onPassword={setPassword} onCode={setMfaCode} returnTo={returnTo} />}
        {setup ? <label className="mt-3 flex items-start gap-3 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={confirmation === "RESET ENCRYPTION TRUST"} onChange={event => setConfirmation(event.target.checked ? "RESET ENCRYPTION TRUST" : "")} />I want to sign out my other devices and use this one. I understand that old messages still need their original keys.</label> : <label className="block text-xs">Type RESET ENCRYPTION TRUST to confirm<input className="field-input mt-1 w-full" aria-label="Encryption recovery confirmation" value={confirmation} maxLength={30} onChange={event => setConfirmation(event.target.value)} /></label>}
        <button type="button" className="btn btn-secondary mt-3" disabled={busy || confirmation !== "RESET ENCRYPTION TRUST" || Boolean(recoveryEmail && emailRecoveryCode.length !== 6) || (setup && !recoveryEmail)} onClick={() => {
          setBusy(true); setStatus("Checking your email, sign-in and this device…");
          void encryption.approveDevice(current.deviceId, current.fingerprint, { decision: "recover", confirmation, password, mfaCode, ...(recoveryEmail ? { emailCode: emailRecoveryCode } : {}) }).then(async () => {
            setPassword(""); setMfaCode(""); setEmailRecoveryCode(""); setConfirmation(""); setRecoveryOpen(false); await refresh();
            setStatus("This device is set up. Reload to send messages. Older chats need their original keys from a device that can read them.");
            window.dispatchEvent(new Event("maddy:message-request-keys"));
          }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Recovery could not be verified.")).finally(() => setBusy(false));
        }}>{recoveryEmail ? "Confirm email and recover this browser" : "Recover encryption on this browser"}</button>
      </div>}
    </div>}
    {setup && !recoveryOpen && current && !current.trustedAt && <div className="mt-3 rounded-xl border border-[var(--border)] p-3 text-sm">
      <p className="font-semibold">Keep this page open while your linked device scans the QR.</p>
      <p className="mt-1 text-xs text-[var(--muted)]">After approval, this phone will be trusted. You can then restore old chats from a device that still has their keys.</p>
      {links.filter(link => link.deviceId === encryption.deviceId).map(link => <p key={link.id} className="mt-2 text-xs text-[var(--muted)]" role="status">Device link: {link.status}</p>)}
    </div>}
    {encryption.error && !current?.trustedAt && (!setup || !current) && <p role="status" className="mt-2 text-sm">{encryption.error}</p>}
    {status && !(recoveryOpen && recoveryEmail) && <p role="status" className="mt-2 text-sm">{status}</p>}
    {!setup && <ul className="mt-3 space-y-3">{devices.filter(device => !device.trustedAt && device.deviceId !== encryption.deviceId && !device.sessionRevokedAt && device.sessionState !== "expired").map(device => <li key={device.deviceId} className="border-t border-[var(--border)] pt-3">
      <p className="text-sm font-semibold">New device: {device.deviceName || browserLabel(device.browser) || "Device waiting to link"}</p>
      {current?.trustedAt ? <div className="mt-2 rounded-xl bg-[var(--surface-2)] p-3 text-xs"><p>Safety number: <code className="font-semibold">{device.fingerprint.slice(0, 8)}…{device.fingerprint.slice(-8)}</code></p><details className="mt-2"><summary className="min-h-11 cursor-pointer py-2">Show full safety number</summary><code className="block break-all select-all">{device.fingerprint}</code></details></div> : null}
      {device.country ? <p className="mt-1 text-xs text-[var(--muted)]">Country: {countryName(device.country)}</p> : null}
      <p className="mt-1 text-xs">{device.sessionRevokedAt ? "Signed out / revoked — sign in on that browser before linking." : "Waiting for approval — messages from before aren't available yet."}</p>
      {!current?.trustedAt && <p className="mt-2 text-xs text-[var(--muted)]">Approval needs a linked browser. Use the device list above, or use secure recovery.</p>}
      {current?.trustedAt && <>
      {links.filter(link => link.deviceId === device.deviceId && link.status === "pending").map(link => <div key={link.id} className="mt-2">
        <button className="btn btn-secondary mt-2" type="button" disabled={busy || !current?.trustedAt} onClick={() => {
          setBusy(true); setStatus("Rejecting device linking…");
          void encryption.approveDevice(device.deviceId, device.fingerprint, { linkId: link.id, decision: "reject" }).then(async () => { await refresh(); setStatus("Linking rejected. No access was given."); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to reject linking.")).finally(() => setBusy(false));
        }}>Reject device linking</button>
      </div>)}
      {links.some(link => link.deviceId === device.deviceId && link.status === "pending") && scannedLink && links.find(link => link.id === scannedLink.requestId)?.deviceId === device.deviceId ? <>
      <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={verified.includes(device.deviceId)} onChange={event => setVerified(previous => event.target.checked ? [...previous, device.deviceId] : previous.filter(id => id !== device.deviceId))} />I compared this safety number with the new phone and it matches.</label>
      <button type="button" className="btn btn-primary mt-2" disabled={busy || !current?.trustedAt || !verified.includes(device.deviceId)} onClick={() => {
        setBusy(true); setStatus("");
        void encryption.approveDevice(device.deviceId, device.fingerprint, { linkId: scannedLink.requestId, token: scannedLink.token, decision: "approve" }).then(async () => { setScannedLink(null); await refresh(); setVerified([]); setStatus("Device approved. Existing chat keys are synchronizing from this browser."); window.dispatchEvent(new Event("maddy:message-request-keys")); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Approval failed.")).finally(() => setBusy(false));
      }}>Approve this device</button>
      {!verified.includes(device.deviceId) && <p className="mt-1 text-xs text-[var(--muted)]">Check the safety number on both screens to approve.</p>}
      </> : <p className="mt-2 text-xs text-[var(--muted)]">Scan this device’s QR code to verify the request before approving.</p>}
      </>}
    </li>)}</ul>}
    {(!setup || !recoveryOpen) && <details className="mt-4 text-sm"><summary className="cursor-pointer min-h-11 py-3">{setup ? "Need help?" : "Troubleshooting"}</summary>
<details className="mt-3 text-sm text-[var(--muted)]"><summary className="cursor-pointer">How browser trust and chat recovery work</summary><p className="mt-2">Trust belongs to this account and this browser&apos;s saved encryption key, not the laptop or phone itself. Signing in again in the same browser keeps its approval; a different browser, a different website address, or clearing browser storage creates a new device that needs linking once. Approval permits key sharing; it does not mean every chat key has synchronized.</p></details>
    {current?.trustedAt && <button type="button" className="btn btn-secondary mt-3 mr-2" disabled={busy} onClick={() => { setBusy(true); setStatus("Sharing chat keys with your other devices…"); void syncKnownConversations().then(setStatus).catch(error => setStatus(error.message)).finally(() => setBusy(false)); }}>Share chat keys with my other devices</button>}
    <button type="button" className="btn btn-secondary mt-3" disabled={busy || !encryption.initialized} onClick={() => { setBusy(true); setStatus("Checking…"); void refresh().then(() => { setStatus("Device list updated."); window.dispatchEvent(new Event("maddy:message-request-keys")); }).catch(cause => setStatus(cause instanceof Error ? cause.message : "Unable to load devices.")).finally(() => setBusy(false)); }}>{busy ? "Checking devices…" : "Refresh encryption devices"}</button>
    <p className="mt-3 text-xs text-[var(--muted)]">Clearing browser data removes saved chat keys and drafts. Save a recovery file before doing so.</p></details>}
  </section>;
}
