"use client";

import { usePathname } from "next/navigation";
import { ForegroundMessageBanner } from "@/components/foreground-message-banner";
import { AudioCallProvider } from "@/components/providers/audio-call-provider";
import type { ReactNode } from "react";
import { E2EEProvider } from "@/components/providers/e2ee-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { CloudRecoverySync } from "@/components/profile/cloud-recovery";
import { PwaNotificationPrompt } from "@/components/pwa-notification-prompt";

/** Keep private chat startup code out of public/login route bundles. */
export default function ApplicationLayout({ children }: { children: ReactNode }) {
  const setupOnly = usePathname() === "/app/device-access";
  return <E2EEProvider setupOnly={setupOnly}>{setupOnly ? children : <RealtimeProvider><AudioCallProvider>{children}<ForegroundMessageBanner /><CloudRecoverySync /><PwaNotificationPrompt /></AudioCallProvider></RealtimeProvider>}</E2EEProvider>;
}
