"use client";
import { LoginForm } from "./login-form";
import { GoogleSignIn } from "./google-sign-in";
import { PhoneSignIn } from "./phone-sign-in";
export function LoginOptions({ next, phoneEnabled }: { next?: string; phoneEnabled: boolean }) {
  return <>
    <LoginForm next={next} />
    <GoogleSignIn next={next} />
    {phoneEnabled ? <PhoneSignIn next={next} /> : null}
  </>;
}
