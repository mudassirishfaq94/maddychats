"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, QrCode, Key, X, AlertTriangle } from "lucide-react";

export function TwoFactorAuth() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/privacy/2fa/status")
      .then((r) => r.json())
      .then((data) => setEnabled(data.enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSetup() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/privacy/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to set up 2FA.");
        return;
      }
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      setSetupMode(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    if (!verifyCode.trim()) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/privacy/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed.");
        return;
      }
      setEnabled(true);
      setSetupMode(false);
      setSuccess("Two-factor authentication enabled successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/privacy/2fa/verify", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to disable 2FA.");
        return;
      }
      setEnabled(false);
      setSuccess("Two-factor authentication disabled.");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="card-flat rounded-2xl p-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  return (
    <div className="card-glass rounded-2xl p-5 sm:p-6 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="h-4.5 w-4.5 text-[var(--accent)]" />
        <h2 className="text-sm font-bold">Two-Factor Authentication</h2>
        {enabled && (
          <span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--success)]">
            Enabled ✓
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-[var(--muted)]">
        Add an extra layer of security by requiring a verification code from an authenticator app when you sign in.
      </p>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3 text-xs text-[var(--danger)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--success)_8%,transparent)] p-3 text-xs text-[var(--success)]">
          {success}
        </div>
      )}

      {setupMode && secret ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Step 1: Add to your authenticator app
            </p>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Scan this QR code or enter the secret manually:
            </p>
            <div className="flex flex-col items-center gap-3">
              {/* ASCII QR placeholder — the otpauth URL is the actual key */}
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <Key className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                <code className="select-all break-all text-xs font-mono">{secret}</code>
              </div>
              <a
                href={otpauthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                <QrCode className="h-3.5 w-3.5" />
                Open QR code link
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Step 2: Enter verification code
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleVerify}
                disabled={submitting || verifyCode.length !== 6}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSetupMode(false);
              setVerifyCode("");
              setError("");
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X className="h-3.5 w-3.5" />
            Cancel setup
          </button>
        </div>
      ) : (
        <div className="mt-4">
          {enabled ? (
            <button
              type="button"
              onClick={handleDisable}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--danger)] px-4 py-2.5 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Disable two-factor authentication"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSetup}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Enable two-factor authentication
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
