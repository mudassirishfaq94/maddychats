"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, AtSign, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { loginSchema, fieldErrors } from "@/lib/schemas";
import { useAuth } from "@/components/providers/auth-provider";
import { Field } from "./field";

export function LoginForm({ next }: { next?: string }) {
  const { signIn } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const target = next && next.startsWith("/") ? next : "/app";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);

    const result = await signIn(parsed.data);
    setPending(false);

    if (!result.ok) {
      setFormError(result.error ?? "Sign in failed.");
      if (result.fields) setErrors(result.fields);
      return;
    }
    // Full navigation: guarantees the just-set session cookie accompanies the
    // first request to /app in every embedding context (incl. iframes).
    window.location.assign(target);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}

      <Field
        label="Email or username"
        icon={<AtSign className="h-4 w-4" />}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="you@example.com"
        autoComplete="username"
        autoFocus
        error={errors.identifier}
      />

      <div>
        <Field
          label="Password"
          type={showPassword ? "text" : "password"}
          icon={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
          error={errors.password}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <div className="mt-2.5 text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
