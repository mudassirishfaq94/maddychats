"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EncryptionDevices } from "./encryption-devices";
import { deviceAccessDestination } from "@/lib/device-access-navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function DeviceAccess({ recoveryEmail, next, openRecovery }: { recoveryEmail?: string; next: string; openRecovery: boolean }) {
  const router = useRouter();
  const { signOut, status } = useAuth();
  const destination = deviceAccessDestination(next);
  const [verificationError, setVerificationError] = useState("");
  useEffect(() => { if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(destination)}`); }, [status, router, destination]);
  const continueToApp = useCallback(() => {
    void fetch("/api/auth/me", { cache: "no-store", signal: AbortSignal.timeout(15000) })
      .then(response => {
        if (response.status !== 200) throw new Error("Device verification is not complete yet.");
        router.replace(destination);
      })
      .catch(() => setVerificationError("We couldn’t finish checking this device. Retry below. Your saved keys are safe."));
  }, [router, destination]);
  const returnTo = `/app/device-access?recovery=1&next=${encodeURIComponent(destination)}`;
  return <div className="min-w-0 space-y-4">
    <EncryptionDevices recoveryEmail={recoveryEmail} openRecovery={openRecovery} setup onTrusted={continueToApp} returnTo={returnTo} />
    {verificationError && <div role="status" className="rounded-xl border border-[var(--border)] p-3 text-sm"><p>{verificationError}</p><button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => window.location.reload()}>Retry device verification</button></div>}
    <button type="button" onClick={() => void signOut()} className="btn btn-secondary w-full">Cancel and sign out</button>
    <p className="text-xs leading-relaxed text-[var(--muted)]">Finish this check to open your account. Linking keeps your other devices signed in. Email recovery signs them out after you confirm.</p>
  </div>;
}
