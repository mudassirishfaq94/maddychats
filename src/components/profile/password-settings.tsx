"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { navigateWithReload } from "@/lib/navigation";
export function PasswordSettings({ email, google }: { email: string; google: boolean }) {
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [mfaCode, setMfa] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function change(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, password, confirmPassword, mfaCode }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? "Password change failed. Please retry."); return; }
      navigateWithReload("/login?passwordChanged=1");
    } catch { setMessage("Could not connect. Please retry; your password may have changed if the request completed."); }
    finally { setBusy(false); }
  }
  async function emailReset() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      setMessage(response.ok ? "A reset email has been requested. Check your inbox and spam folder for a one-time link." : data.error ?? "Could not request a reset email.");
    } catch { setMessage("Could not connect. Wait one minute and try again."); }
    finally { setBusy(false); }
  }
  if (email.endsWith("@auth.maddychats.invalid")) return <section className="card-glass min-w-0 rounded-3xl p-4 sm:p-8"><h2 className="font-display text-xl font-bold">Password</h2><p className="mt-2 text-sm">Email password recovery requires a verified email address. Keep using your connected sign-in method.</p></section>;
  return <section className="card-glass min-w-0 rounded-3xl p-4 sm:p-8">
    <h2 className="font-display text-xl font-bold">Password</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Changing your password signs out existing sessions. Your chat encryption keys are kept.</p>
    {google ? <div className="mt-4 rounded-xl border border-[var(--border)] p-3 text-sm"><p>Signed up with Google? If you have never set a Circlo password, use the email link below to set one. Your Google password belongs to Google—do not enter it here.</p><button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={() => void emailReset()}>Email me a password setup link</button></div> : null}
    <form onSubmit={change} className="mt-4 space-y-3">
      <label className="block text-sm">Current Circlo password<input className="field-input mt-1 w-full" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrent(event.target.value)} /></label>
      <label className="block text-sm">New password<input className="field-input mt-1 w-full" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <p className="text-xs text-[var(--muted)]">8–72 characters, including uppercase, lowercase, and a number.</p>
      <label className="block text-sm">Confirm new password<input className="field-input mt-1 w-full" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirm(event.target.value)} /></label>
      <label className="block text-sm">Authenticator or recovery code (if enabled)<input className="field-input mt-1 w-full" autoComplete="one-time-code" value={mfaCode} onChange={event => setMfa(event.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Please wait…" : "Change password"}</button>
    </form>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={busy} className="text-sm underline" onClick={() => void emailReset()}>Forgot your current password? Send a reset email</button><Link className="text-sm underline" href="/forgot-password">Open password recovery</Link></div>
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
  </section>;
}
