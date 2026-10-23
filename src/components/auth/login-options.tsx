"use client";
import { LoginForm } from "./login-form";
import { GoogleSignIn } from "./google-sign-in";

export function LoginOptions({ next }: { next?: string }) {
  return <>
    <LoginForm next={next} />
    <GoogleSignIn next={next} />
  </>;
}
