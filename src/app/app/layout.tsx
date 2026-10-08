import type { ReactNode } from "react";
import { E2EEProvider } from "@/components/providers/e2ee-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";

/** Keep private chat startup code out of public/login route bundles. */
export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return <E2EEProvider><RealtimeProvider>{children}</RealtimeProvider></E2EEProvider>;
}
