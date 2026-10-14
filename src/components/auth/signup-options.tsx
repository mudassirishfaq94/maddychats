"use client";
import { useState } from "react";
import { RegisterForm } from "./register-form";
import { GoogleSignIn } from "./google-sign-in";
import { PhoneSignIn } from "./phone-sign-in";
import { PolicyAgreement } from "./policy-agreement";
export function SignupOptions({ phoneEnabled }: { phoneEnabled: boolean }) {
  const [consent, setConsent] = useState({ acceptTerms: false, acceptPrivacy: false });
  return <>
    <div className="mb-5"><PolicyAgreement value={consent} onChange={setConsent} /></div>
    <RegisterForm consent={consent} />
    <GoogleSignIn consent={consent} />
    {phoneEnabled ? <PhoneSignIn signup consent={consent} /> : null}
  </>;
}
