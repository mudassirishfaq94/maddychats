"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EncryptionDevices } from "./encryption-devices";
import { deviceAccessDestination } from "@/lib/device-access-navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function DeviceAccess({ recoveryEmail, next, openRecovery }: { recoveryEmail?: string; next: string; openRecovery: boolean }) {
  const router = useRouter();
  const { signOut, status } = useAuth();
  const destination = deviceAccessDestination(next);
  useEffect(() => { if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(destination)}`); }, [status, router, destination]);
  const continueToApp = useCallback(() => router.replace(destination), [router, destination]);
  const returnTo = `/app/device-access?recovery=1&next=${encodeURIComponent(destination)}`;
  return <div className="min-w-0">
    <EncryptionDevices recoveryEmail={recoveryEmail} openRecovery={openRecovery} setup onTrusted={continueToApp} onCancel={() => void signOut()} returnTo={returnTo} />
  </div>;
}
