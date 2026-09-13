"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function VerifyEmailPage() {
  const [state, setState] = useState<"checking"|"verified"|"invalid"|"idle"|"sent"|"error">("checking");
  const [email, setEmail] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setState("idle"); return; }
    fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then((r) => setState(r.ok ? "verified" : "invalid")).catch(() => setState("error"));
  }, []);
  async function resend() {
    setState("checking");
    const r = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setState(r.ok ? "sent" : "error");
  }
  return <main className="mx-auto flex min-h-screen max-w-md items-center p-6"><section className="w-full rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 text-center"><p className="text-2xl font-black text-[var(--accent)]">Circlo</p>{state === "checking" ? <p className="mt-5">Checking your verification link…</p> : state === "verified" ? <><h1 className="mt-5 text-2xl font-bold">Email Verified!</h1><p className="mt-2 text-[var(--muted)]">Your Circlo account has been successfully verified.</p><Link className="btn btn-primary mt-6" href="/login">Continue to Circlo</Link></> : <><h1 className="mt-5 text-2xl font-bold">{state === "invalid" ? "Verification Link Expired" : "Check your inbox"}</h1><p className="mt-2 text-[var(--muted)]">Enter your email to receive a new Circlo verification link.</p><input className="field-input mt-5 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/><button className="btn btn-primary mt-3 w-full" onClick={resend}>Resend Verification Email</button>{state === "sent" ? <p className="mt-3 text-sm text-[var(--success)]">If an account needs verification, an email is on its way.</p> : null}{state === "error" ? <p className="mt-3 text-sm text-[var(--danger)]">We couldn’t send that right now. Please try again shortly.</p> : null}<Link className="mt-5 block text-sm text-[var(--accent)]" href="/login">Back to login</Link></>}</section></main>;
}
