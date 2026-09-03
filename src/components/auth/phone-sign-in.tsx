"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Loader2, Phone, RefreshCw, X } from "lucide-react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut as signOutFirebase,
  type ConfirmationResult,
} from "firebase/auth";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

type Stage = "closed" | "phone" | "otp" | "success";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries()
  .map((code) => ({
    code,
    name: regionNames.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

function authErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (error instanceof Error && error.message.includes("required for Firebase")) {
    return "Phone sign-in is not configured yet.";
  }
  switch (code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "Enter a valid phone number.";
    case "auth/invalid-verification-code":
      return "That verification code is incorrect.";
    case "auth/code-expired":
    case "auth/session-expired":
      return "That code has expired. Request a new one.";
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "Too many SMS attempts. Please wait before trying again.";
    case "auth/captcha-check-failed":
    case "auth/missing-app-credential":
    case "auth/invalid-app-credential":
      return "reCAPTCHA verification failed. Please try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/cancelled-popup-request":
    case "auth/popup-closed-by-user":
      return "Phone verification was cancelled.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Phone verification could not be completed.";
  }
}

export function PhoneSignIn({
  next = "/app",
  mode = "signin",
  onLinked,
}: {
  next?: string;
  mode?: "signin" | "link";
  onLinked?: () => void | Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>("closed");
  const [country, setCountry] = useState<CountryCode>("AE");
  const [nationalNumber, setNationalNumber] = useState("");
  const [sentNumber, setSentNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaContainer = useRef<HTMLDivElement>(null);
  const captchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const selectedCallingCode = useMemo(() => getCountryCallingCode(country), [country]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => () => captchaVerifier.current?.clear(), []);

  function clearCaptcha() {
    captchaVerifier.current?.clear();
    captchaVerifier.current = null;
    if (captchaContainer.current) captchaContainer.current.replaceChildren();
  }

  async function verifier(): Promise<RecaptchaVerifier> {
    if (captchaVerifier.current) return captchaVerifier.current;
    if (!captchaContainer.current) throw new Error("reCAPTCHA is not ready. Please try again.");
    const { firebaseAuth } = await import("@/lib/firebase-client");
    firebaseAuth.useDeviceLanguage();
    captchaVerifier.current = new RecaptchaVerifier(firebaseAuth, captchaContainer.current, {
      size: "normal",
      "expired-callback": () => setError("reCAPTCHA expired. Complete it again before sending a code."),
    });
    return captchaVerifier.current;
  }

  function normalizedNumber(): string | null {
    const parsed = parsePhoneNumberFromString(nationalNumber, country);
    return parsed?.isValid() ? parsed.number : null;
  }

  async function sendCode() {
    const phoneNumber = normalizedNumber();
    if (!phoneNumber) {
      setError("Enter a valid phone number for the selected country.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { firebaseAuth } = await import("@/lib/firebase-client");
      const result = await signInWithPhoneNumber(firebaseAuth, phoneNumber, await verifier());
      setConfirmation(result);
      setSentNumber(phoneNumber);
      setOtp("");
      setCooldown(60);
      setStage("otp");
    } catch (cause) {
      setError(authErrorMessage(cause));
      clearCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!confirmation || !/^\d{6}$/.test(otp)) {
      setError("Enter the complete 6-digit verification code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const credential = await confirmation.confirm(otp);
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch(mode === "link" ? "/api/auth/phone/link" : "/api/auth/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await response.json().catch(() => null) as { error?: string; isNewUser?: boolean } | null;
      if (!response.ok) throw new Error(data?.error ?? (mode === "link" ? "Phone number could not be linked." : "Maddy Chats sign-in could not be completed."));
      setStage("success");
      const { firebaseAuth } = await import("@/lib/firebase-client");
      await signOutFirebase(firebaseAuth).catch(() => undefined);
      if (mode === "link") {
        await onLinked?.();
        return;
      }
      window.location.assign(data?.isNewUser ? "/app/profile?onboarding=1" : target);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (cooldown > 0 || busy) return;
    clearCaptcha();
    await sendCode();
  }

  function close() {
    clearCaptcha();
    setStage("closed");
    setConfirmation(null);
    setOtp("");
    setCooldown(0);
    setBusy(false);
    setError(null);
  }

  if (stage === "closed") {
    return (
      <button type="button" onClick={() => setStage("phone")} className="btn btn-secondary mt-3 w-full">
        <Phone className="h-4 w-4" />
        {mode === "link" ? "Add phone" : "Continue with Phone"}
      </button>
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 animate-fade-up" aria-label="Phone sign-in">
      <div className="flex items-center gap-2">
        {stage === "otp" ? (
          <button type="button" onClick={() => { setStage("phone"); setError(null); }} aria-label="Change phone number" className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]">
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : <Phone className="h-4 w-4 text-[var(--accent-fg)]" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{stage === "otp" ? "Enter verification code" : stage === "success" ? (mode === "link" ? "Phone connected" : "Phone verified") : (mode === "link" ? "Connect phone" : "Sign in with phone")}</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {stage === "otp" ? `We sent a code to ${sentNumber}` : stage === "success" ? (mode === "link" ? "Authentication methods updated." : "Opening Maddy Chats…") : "SMS rates may apply."}
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Cancel phone sign-in" className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2.5 text-xs text-[var(--danger)]">{error}</p> : null}

      {stage === "phone" ? (
        <div className="mt-4 space-y-3">
          <label className="field-label" htmlFor="phone-country">Phone number</label>
          <div className="flex min-w-0 gap-2">
            <select id="phone-country" value={country} onChange={(event) => setCountry(event.target.value as CountryCode)} disabled={busy} aria-label="Country code" className="field-input w-[42%] shrink-0 px-2! text-xs!">
              {countries.map((item) => <option key={item.code} value={item.code}>{item.name} (+{item.callingCode})</option>)}
            </select>
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">+{selectedCallingCode}</span>
              <input value={nationalNumber} onChange={(event) => setNationalNumber(event.target.value.replace(/[^\d\s()-]/g, ""))} disabled={busy} inputMode="tel" autoComplete="tel-national" placeholder="50 123 4567" aria-label="Phone number" className="field-input min-w-0 pl-12!" />
            </div>
          </div>
          <button type="button" onClick={() => void sendCode()} disabled={busy || !nationalNumber.trim()} className="btn btn-primary w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      ) : null}

      {stage === "otp" ? (
        <div className="mt-4 space-y-3">
          <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter") void verifyCode(); }} disabled={busy} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus aria-label="6-digit verification code" placeholder="000000" className="field-input text-center font-mono text-xl! tracking-[0.45em]" />
          <button type="button" onClick={() => void verifyCode()} disabled={busy || otp.length !== 6} className="btn btn-primary w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <button type="button" onClick={() => void resendCode()} disabled={busy || cooldown > 0} className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-[var(--accent-fg)] disabled:text-[var(--muted)]">
            <RefreshCw className="h-3.5 w-3.5" />
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      ) : null}

      {stage === "success" ? <p className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--success)]"><CheckCircle2 className="h-4 w-4" />Verified successfully</p> : null}

      {stage !== "success" ? (
        <div className="mt-4 h-[70px] max-w-full overflow-hidden rounded-lg">
          <div ref={captchaContainer} className="origin-top-left scale-[0.88] min-[360px]:scale-100" />
        </div>
      ) : null}
    </section>
  );
}
