"use client";

import { usePathname } from "next/navigation";
import { ForegroundMessageBanner } from "@/components/foreground-message-banner";
import { AudioCallProvider } from "@/components/providers/audio-call-provider";
import type { ReactNode } from "react";
import { E2EEProvider } from "@/components/providers/e2ee-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { CloudRecoverySync } from "@/components/profile/cloud-recovery";
import { LocalBackupSync } from "@/components/profile/local-backup-sync";
import { OfflineComposeProvider } from "@/components/providers/offline-compose-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { AppShell } from "@/components/shell/app-shell";
import { ConversationListProvider } from "@/components/providers/conversation-list-provider";
import { PwaNotificationPrompt } from "@/components/pwa-notification-prompt";

/** Keep private chat startup code out of public/login route bundles. */
export default function ApplicationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const setupOnly = pathname === "/app/device-access";
  const notificationPreviewOnly = pathname === "/app/notification-preview";
  const adminOnly = pathname.startsWith("/app/admin");
  const sharedShell = user && pathname !== "/app/call" && !pathname.startsWith("/app/admin") && !setupOnly;
  const content = sharedShell ? <AppShell user={user}>{children}</AppShell> : children;
  if (adminOnly) return children; // Admin tools do not need chat keys or device linking.
  return <E2EEProvider setupOnly={setupOnly || notificationPreviewOnly}>{setupOnly || notificationPreviewOnly ? children : <RealtimeProvider><AudioCallProvider><ConversationListProvider>{content}<ForegroundMessageBanner /><CloudRecoverySync /><LocalBackupSync /><PwaNotificationPrompt /><OfflineComposeProvider /></ConversationListProvider></AudioCallProvider></RealtimeProvider>}</E2EEProvider>;
}
