"use client";
import { useState } from "react";
import { LoginForm } from "./login-form";
import { GoogleSignIn } from "./google-sign-in";
import { PolicyAgreement } from "./policy-agreement";
export function LoginOptions({ next }: { next?: string }) {
  const [consent, setConsent] = useState({ acceptTerms: false, acceptPrivacy: false });
  return <>
    <LoginForm next={next} consent={consent} agreement={<PolicyAgreement value={consent} onChange={setConsent} />} />
    <GoogleSignIn next={next} consent={consent} />
  </>;
}
