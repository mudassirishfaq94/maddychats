import { ForegroundMessageBanner } from "@/components/foreground-message-banner";
import { AudioCallProvider } from "@/components/providers/audio-call-provider";
import type { ReactNode } from "react";
import { E2EEProvider } from "@/components/providers/e2ee-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { PwaNotificationPrompt } from "@/components/pwa-notification-prompt";

/** Keep private chat startup code out of public/login route bundles. */
export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return <E2EEProvider><RealtimeProvider><AudioCallProvider>{children}<ForegroundMessageBanner /><PwaNotificationPrompt /></AudioCallProvider></RealtimeProvider></E2EEProvider>;
}
