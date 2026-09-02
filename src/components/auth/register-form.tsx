"use client";

import type * as React from "react";
import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  AtSign,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { fieldErrors, registerSchema } from "@/lib/schemas";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import { Field } from "./field";

function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return score;
}

const METER_LABELS = ["Too short", "Okay", "Good", "Strong", "Excellent"];

export function RegisterForm() {
  const { signUp } = useAuth();

  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const score = useMemo(() => passwordScore(form.password), [form.password]);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);

    const result = await signUp(parsed.data);
    setPending(false);

    if (!result.ok) {
      setFormError(result.error ?? "Registration failed.");
      if (result.fields) setErrors(result.fields);
      return;
    }
    // Full navigation: guarantees the just-set session cookie accompanies the
    // first request to /app in every embedding context (incl. iframes).
    window.location.assign("/app");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
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
        label="Display name"
        icon={<User className="h-4 w-4" />}
        value={form.displayName}
        onChange={update("displayName")}
        placeholder="Maddy Reyes"
        autoComplete="name"
        autoFocus
        error={errors.displayName}
      />

      <Field
        label="Username"
        icon={<AtSign className="h-4 w-4" />}
        value={form.username}
        onChange={update("username")}
        placeholder="maddy"
        autoComplete="username"
        hint="Unique. Letters, numbers and underscores."
        error={errors.username}
      />

      <Field
        label="Email"
        type="email"
        icon={<Mail className="h-4 w-4" />}
        value={form.email}
        onChange={update("email")}
        placeholder="you@example.com"
        autoComplete="email"
        error={errors.email}
      />

      <div>
        <Field
          label="Password"
          type={showPassword ? "text" : "password"}
          icon={<Lock className="h-4 w-4" />}
          value={form.password}
          onChange={update("password")}
          placeholder="8+ characters, upper/lowercase and a number"
          autoComplete="new-password"
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
        {form.password ? (
          <div className="mt-2.5 flex items-center gap-2.5" aria-hidden="true">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-all duration-300",
                    i < score
                      ? score <= 1
                        ? "bg-[var(--danger)]"
                        : score === 2
                          ? "bg-[var(--warning)]"
                          : "bg-[var(--success)]"
                      : "bg-[var(--border)]",
                  )}
                />
              ))}
            </div>
            <span className="text-[0.68rem] font-medium text-[var(--muted)]">
              {METER_LABELS[score]}
            </span>
          </div>
        ) : null}
      </div>

      <Field
        label="Confirm password"
        type={showPassword ? "text" : "password"}
        icon={<Lock className="h-4 w-4" />}
        value={form.confirmPassword}
        onChange={update("confirmPassword")}
        placeholder="Repeat your password"
        autoComplete="new-password"
        error={errors.confirmPassword}
      />

      <button type="submit" disabled={pending} className="btn btn-primary mt-6! w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Creating your account…" : "Create account"}
      </button>

      <p className="text-center text-xs leading-relaxed text-[var(--muted)]">
        Your password is securely hashed and never stored as plain text.
      </p>
    </form>
  );
}
