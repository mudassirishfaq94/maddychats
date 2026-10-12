"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export function MfaForm({ next = "/app" }: { next?: string }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Verification failed."); return; }
      window.location.assign(next.startsWith("/") && !next.startsWith("//") ? next : "/app");
    } catch { setError("Could not connect. Try again."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm">Enter the six-digit code from your authenticator app, or one of your saved recovery codes.</p>
    <label className="block text-sm">Authenticator or recovery code
      <input className="field-input mt-2" autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} required />
    </label>
    {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
    <button className="btn btn-primary w-full" disabled={pending || !code.trim()}>{pending ? "Verifying…" : "Verify and sign in"}</button>
    <Link className="block text-sm text-[var(--accent)]" href="/login">Start sign-in again</Link>
  </form>;
}
