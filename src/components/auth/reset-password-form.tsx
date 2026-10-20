"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { fieldErrors, resetPasswordSchema } from "@/lib/schemas";
import { Field } from "./field";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
    if (!parsed.success) { setFields(fieldErrors(parsed.error)); return; }
    setFields({}); setPending(true);
    const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    if (!response?.ok) { setError(data?.error ?? "Your password could not be reset."); if (data?.fields) setFields(data.fields); }
    else setDone(true);
    setPending(false);
  }
  if (done) return <div className="space-y-5 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]"><CheckCircle2 className="h-7 w-7" /></span><div><h2 className="font-display text-xl font-bold">Password updated</h2><p className="mt-2 text-sm text-[var(--muted)]">Your new password is ready. Sign in to continue chatting.</p></div><Link href="/login" className="btn btn-primary w-full">Sign in</Link></div>;
  if (!token) return <div className="space-y-4 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-[var(--danger)]" /><p className="text-sm text-[var(--muted)]">This reset link is incomplete or invalid.</p><Link href="/forgot-password" className="btn btn-secondary w-full">Request another link</Link></div>;
  const trailing = <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"} className="text-[var(--muted)]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>;
  return <form onSubmit={submit} className="space-y-5" noValidate>{error ? <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}<Field label="New password" type={show ? "text" : "password"} icon={<Lock className="h-4 w-4" />} trailing={trailing} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="8+ characters, upper/lowercase and a number" error={fields.password} /><Field label="Confirm new password" type={show ? "text" : "password"} icon={<Lock className="h-4 w-4" />} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" placeholder="Repeat your new password" error={fields.confirmPassword} /><button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{pending ? "Updating…" : "Update password"}</button></form>;
}
