"use client";
import { useState } from "react";
import { RegisterForm } from "./register-form";
import { GoogleSignIn } from "./google-sign-in";
import { PolicyAgreement } from "./policy-agreement";
export function SignupOptions() {
  const [consent, setConsent] = useState({ acceptTerms: false, acceptPrivacy: false });
  return <>
    <RegisterForm consent={consent} agreement={<PolicyAgreement value={consent} onChange={setConsent} />} />
    <GoogleSignIn consent={consent} />
  </>;
}
