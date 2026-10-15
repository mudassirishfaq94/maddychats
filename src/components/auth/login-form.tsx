"use client";

import { navigateWithReload } from "@/lib/navigation";
import { deviceAccessPath } from "@/lib/device-access-navigation";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, AtSign, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { loginSchema, fieldErrors } from "@/lib/schemas";
import { useAuth } from "@/components/providers/auth-provider";
import { Field } from "./field";
import { acceptsPolicies, type PolicyConsent } from "@/lib/policy-consent";

export function LoginForm({ next, consent, agreement }: { next?: string; consent: PolicyConsent; agreement?: ReactNode }) {
  const { signIn } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const target = next && next.startsWith("/") && !next.startsWith("//") && !/[\\\u0000-\u0020]/.test(next) ? next : "/app";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setVerificationRequired(false);

    if (!acceptsPolicies(consent)) { setFormError("Agree to both policies before signing in."); return; }
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);

    const result = await signIn({ ...parsed.data, ...consent });
    setPending(false);

    if (result.mfaRequired) { navigateWithReload(`/login?mfa=1&next=${encodeURIComponent(target)}`); return; }
    if (!result.ok) {
      setVerificationRequired(Boolean(result.verificationRequired));
      setFormError(result.error ?? "Sign in failed.");
      if (result.fields) setErrors(result.fields);
      return;
    }
    // Full navigation: guarantees the just-set session cookie accompanies the
    // first request to /app in every embedding context (incl. iframes).
    navigateWithReload(deviceAccessPath(target));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError} {verificationRequired ? <Link href="/verify-email" className="underline">Resend verification email</Link> : null}</span>
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
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <div className="mt-2.5 text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-[var(--accent-fg)] underline-offset-4 transition-opacity hover:underline hover:opacity-80"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      {agreement}
      <button type="submit" disabled={pending || !acceptsPolicies(consent)} className="btn btn-primary w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
