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
      <p className="text-sm">Turn on the extra sign-in check first. If you signed in more than five minutes ago, enter your password and a code from your code app or saved recovery list, then choose an action below. It takes effect right away.</p>
      <Link href="/app/profile" className="text-xs text-[var(--accent)]">Manage the extra sign-in check</Link>
      <FreshAuthentication password={password} code={code} onPassword={setPassword} onCode={setCode} returnTo={pathname} />
    </section>,
  };
}
