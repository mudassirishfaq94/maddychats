"use client";
import { useSecurityCheck } from "./security-check";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LogoWordmark } from "@/components/brand/logo";
import { GoogleSignIn } from "./google-sign-in";

export function VerifyEmailForm({ token, deliveryUnavailable = false, googleVerification = false }: { token: string | null; deliveryUnavailable?: boolean; googleVerification?: boolean }) {
  const challenge = useSecurityCheck("email_verification");
  const [state, setState] = useState<"checking"|"verified"|"invalid"|"idle"|"sent"|"error">(token ? "checking" : "idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  // Strict Mode may subscribe twice; share one token-consumption request.
  const verification = useRef<{ token: string; promise: Promise<boolean> } | null>(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    if (verification.current?.token !== token) {
      verification.current = { token, promise: fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then((r) => { if (r.status === 429 || r.status >= 500) throw new Error("unavailable"); return r.ok; }) };
    }
    verification.current.promise.then((ok) => { if (active) setState(ok ? "verified" : "invalid"); }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [token]);
  async function verifyCode(event: FormEvent) {
    event.preventDefault(); if (!challenge.ready) return; setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/auth/verify-email", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code,turnstileToken:challenge.token})});
      const data = await response.json().catch(() => null);
      if (response.ok) setState("verified"); else setFeedback(data?.error ?? (response.status === 429 ? "Please wait a moment before trying again." : "We couldn't verify that code."));
    } catch { setFeedback("Connection interrupted. Please try again."); }
    finally { challenge.reset(); setBusy(false); }
  }
  async function resend() {
    if (!challenge.ready) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/auth/resend-verification", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,turnstileToken:challenge.token})});
      const data = await response.json().catch(() => null);
      setFeedback(response.ok ? data?.message : data?.error ?? (response.status === 429 ? "Please wait a moment before requesting another code." : "We couldn't request a code right now."));
    } catch { setFeedback("Connection interrupted. Please try again."); }
    finally { challenge.reset(); setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-md items-center p-6"><section className="w-full rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8">
    <LogoWordmark size={40} />
    {state === "checking" ? <p className="mt-5" role="status">Checking your verification link…</p> : state === "verified" ? <><h1 className="mt-5 text-2xl font-bold">Email Verified!</h1><p className="mt-2 text-[var(--muted)]">Your email is verified. Sign in to continue; your existing security settings still apply.</p><Link className="btn btn-primary mt-6" href="/login">Continue to Circlo</Link></> : <>
      <h1 className="mt-5 text-2xl font-bold">Verify your email</h1>
      <p className="mt-2 text-[var(--muted)]">Enter the six-digit code from Circlo. Codes expire after 10 minutes.</p>
      {deliveryUnavailable ? <p className="mt-3" role="status">Your account was created, but the verification email could not be sent. Your account stays protected until you verify your email.</p> : null}
      {state === "error" ? <p className="mt-3" role="alert">We couldn’t check the link right now. Try again shortly, or enter your email code below.</p> : null}
      {state === "invalid" ? <p className="mt-3" role="status">That verification link is invalid or expired. Request a new code below.</p> : null}
      <form onSubmit={verifyCode} className="mt-5 space-y-4">
        <label className="block">Email address<input className="field-input mt-2 w-full" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label className="block">Verification code<input className="field-input mt-2 w-full text-center text-xl tracking-[0.3em]" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="000000" /></label>
        {challenge.field}
        <button className="btn btn-primary w-full" disabled={busy || !challenge.ready}>{busy ? "Please wait…" : "Verify email"}</button>
      </form>
      <button className="btn mt-3 w-full" type="button" disabled={busy || !challenge.ready || !email.trim()} onClick={resend}>Resend verification code</button>
      {feedback ? <p className="mt-3 text-sm text-[var(--muted)]" role="status">{feedback}</p> : null}
      {deliveryUnavailable && googleVerification ? <><p className="mt-4 text-sm text-[var(--muted)]">You can also verify with the same Google account, then enter your Circlo password.</p><GoogleSignIn next="/app" /></> : null}
      <Link className="mt-5 block text-sm text-[var(--accent)]" href="/login">Back to login</Link>
    </>}
  </section></main>;
}
