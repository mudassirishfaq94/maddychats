"use client";
import { useState } from "react";
import { LoginForm } from "./login-form";
import { GoogleSignIn } from "./google-sign-in";
import { PhoneSignIn } from "./phone-sign-in";
import { PolicyAgreement } from "./policy-agreement";
export function LoginOptions({ next, phoneEnabled }: { next?: string; phoneEnabled: boolean }) {
  const [consent, setConsent] = useState({ acceptTerms: false, acceptPrivacy: false });
  return <>
    <div className="mb-5"><PolicyAgreement value={consent} onChange={setConsent} /></div>
    <LoginForm next={next} consent={consent} />
    <GoogleSignIn next={next} consent={consent} />
    {phoneEnabled ? <PhoneSignIn next={next} consent={consent} /> : null}
  </>;
}
