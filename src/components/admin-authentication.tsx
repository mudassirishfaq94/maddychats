"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FreshAuthentication } from "./profile/fresh-authentication";

/** Credentials stay in component memory and are cleared after each action. */
export function useAdminProof() {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const pathname = usePathname();
  return {
    proof: { password, mfaCode: code },
    clearProof: () => { setPassword(""); setCode(""); },
    form: <section className="card-flat rounded-xl p-4">
      <p className="text-sm">To delete a user, enter your password and authenticator code here, then click that user’s Delete button. There is no separate save step. A recent sign-in also works.</p>
      <Link href="/app/profile" className="text-xs text-[var(--accent)]">Manage two-factor authentication</Link>
      <FreshAuthentication password={password} code={code} onPassword={setPassword} onCode={setCode} returnTo={pathname} />
    </section>,
  };
}
