"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Mail,
  Send,
} from "lucide-react";
import { fieldErrors, forgotPasswordSchema } from "@/lib/schemas";
import { Field } from "./field";

type SubmitState =
  | { kind: "idle" }
  | { kind: "delivered" }
  | { kind: "error"; message: string };

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "idle" });

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json().catch(() => null)) as {
        delivered?: boolean;
        reason?: string;
        message?: string;
        error?: string;
        fields?: Record<string, string>;
      } | null;

      if (!res.ok) {
        setState({
          kind: "error",
          message: data?.error ?? "Something went wrong. Please try again.",
        });
        if (data?.fields) setErrors(data.fields);
      } else if (data?.delivered) {
        setState({ kind: "delivered" });
      } else setState({ kind: "error", message: "The reset email could not be sent." });
    } catch {
      setState({ kind: "error", message: "Network error. Please try again." });
    } finally {
      setPending(false);
    }
  }

  if (state.kind === "delivered") {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_9%,transparent)] p-5">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--success)_18%,transparent)] text-[var(--success)]">
              <Send className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Check your inbox
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                If an account exists for <strong className="text-[var(--text)]">{email}</strong>,
                a reset link is on its way.
              </p>
            </div>
          </div>
        </div>
        <Link href="/login" className="btn btn-secondary w-full">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {state.kind === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <Field
        label="Account email"
        type="email"
        icon={<Mail className="h-4 w-4" />}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        autoFocus
        error={errors.email}
      />

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Checking…" : "Request reset link"}
      </button>
    </form>
  );
}
