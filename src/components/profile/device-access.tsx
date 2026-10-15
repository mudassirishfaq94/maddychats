"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { EncryptionDevices } from "./encryption-devices";
import { deviceAccessDestination } from "@/lib/device-access-navigation";

export function DeviceAccess({ recoveryEmail, next, openRecovery }: { recoveryEmail?: string; next: string; openRecovery: boolean }) {
  const router = useRouter();
  const destination = deviceAccessDestination(next);
  const continueToApp = useCallback(() => router.replace(destination), [router, destination]);
  const returnTo = `/app/device-access?recovery=1&next=${encodeURIComponent(destination)}`;
  return <div className="min-w-0 space-y-4">
    <EncryptionDevices recoveryEmail={recoveryEmail} openRecovery={openRecovery} setup onTrusted={continueToApp} returnTo={returnTo} />
    <Link href={destination} className="btn btn-secondary w-full">Set up later</Link>
    <p className="text-xs leading-relaxed text-[var(--muted)]">You can return to these options in Settings → Manage secure devices. Private messages stay protected until this device is ready.</p>
  </div>;
}
