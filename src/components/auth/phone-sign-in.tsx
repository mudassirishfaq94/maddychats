"use client";

import { useRef, useState, type FormEvent } from "react";
import { Loader2, Phone, ShieldCheck, UserRound } from "lucide-react";
import type { RecaptchaVerifier, ConfirmationResult } from "firebase/auth";
import { firebasePhoneAuth, firebasePhoneAuthConfigured } from "@/lib/firebase-client";
import { Field } from "./field";
import { PolicyAgreement } from "./policy-agreement";
import { acceptsPolicies, type PolicyConsent } from "@/lib/policy-consent";

export function PhoneSignIn({ next = "/app", signup = false, consent }: { next?: string; signup?: boolean; consent?: PolicyConsent }) {
  const [localConsent, setLocalConsent] = useState({ acceptTerms: false, acceptPrivacy: false });
  const acceptance = consent ?? localConsent;
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [stage, setStage] = useState<"phone" | "code" | "profile">("phone");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = process.env.NEXT_PUBLIC_STARTER_MODE !== "1" && firebasePhoneAuthConfigured();

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (signup && !acceptsPolicies(acceptance)) { setError("Agree to both signup policies first."); return; }
    if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
      setError("Enter your phone number in international format, e.g. +971501234567.");
      return;
    }
    setPending(true);
    try {
      const [auth, { RecaptchaVerifier, signInWithPhoneNumber }] = await Promise.all([
        firebasePhoneAuth(), import("firebase/auth"),
      ]);
      verifier.current?.clear();
      verifier.current = new RecaptchaVerifier(auth, "phone-recaptcha", { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth, phone.trim(), verifier.current);
      setStage("code");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace(/^Firebase: /, "") : "Could not send a verification code.");
      verifier.current?.clear();
      verifier.current = null;
    } finally { setPending(false); }
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!confirmation.current || !/^\d{6}$/.test(code.trim())) { setError("Enter the six-digit code we sent."); return; }
    setPending(true);
    try {
      const credential = await confirmation.current.confirm(code.trim());
      const idToken = await credential.user.getIdToken();
      const complete = async (profile = false) => fetch("/api/auth/phone", {
        method: "POST", headers: { "Content-Type": "application/json", ...(location.protocol === "https:" ? { "x-secure-context": "1" } : {}) },
        body: JSON.stringify({ idToken, ...acceptance, ...(profile ? { displayName, username } : {}) }),
      });
      let response = await complete(signup || stage === "profile");
      const data = await response.json().catch(() => null) as { error?: string; needsProfile?: boolean; mfaRequired?: boolean; fields?: Record<string, string> } | null;
      if (response.status === 409 && data?.needsProfile) { setStage("profile"); return; }
      if (!response.ok) { setError(data?.fields?.username ?? data?.error ?? "Phone sign-in failed."); return; }
      const target = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
      window.location.assign(data?.mfaRequired ? `/login?mfa=1&next=${encodeURIComponent(target)}` : target);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace(/^Firebase: /, "") : "The verification code was invalid or expired.");
    } finally { setPending(false); }
  }

  if (!configured) return null;
  return <>
    <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[var(--border)]" /><span className="text-xs text-[var(--muted)]">or</span><span className="h-px flex-1 bg-[var(--border)]" /></div>
    <form onSubmit={stage === "phone" ? sendCode : finish} noValidate className="space-y-4">
      {error ? <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {stage === "phone" ? <Field label="Phone number" icon={<Phone className="h-4 w-4" />} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971501234567" autoComplete="tel" /> : null}
      {stage === "code" || stage === "profile" ? <Field label="Verification code" icon={<ShieldCheck className="h-4 w-4" />} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" autoComplete="one-time-code" inputMode="numeric" /> : null}
      {stage === "profile" || (signup && stage === "code") ? <>
        <Field label="Display name" icon={<UserRound className="h-4 w-4" />} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How people will see you" autoComplete="name" />
        <Field label="Username" icon={<UserRound className="h-4 w-4" />} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="letters, numbers, underscores" autoComplete="username" />
      </> : null}
      <div id="phone-recaptcha" />
      {stage === "profile" && !consent ? <PolicyAgreement value={localConsent} onChange={setLocalConsent} /> : null}
      <button type="submit" disabled={pending} className="btn btn-secondary w-full">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}{stage === "phone" ? "Continue with phone" : "Verify and continue"}</button>
    </form>
  </>;
}
