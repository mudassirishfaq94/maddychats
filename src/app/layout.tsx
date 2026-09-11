import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Inter, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/providers/auth-provider";
import { E2EEProvider } from "@/components/providers/e2ee-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { HostedAppUpdates } from "@/components/hosted-app-updates";
import { CapacitorDeepLinks } from "@/components/capacitor-deep-links";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { NativeAppBridge } from "@/components/native-app-bridge";
import "./globals.css";
import "./circlo-green.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "Circlo",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/ziptalk-192.png",
    apple: "/icons/ziptalk-192.png",
  },
  title: {
    default: "Circlo — Your people, your conversations.",
    template: "%s · Circlo",
  },
  description:
    "Circlo is a real-time chat application by Mudassir Ishfaq.",
  authors: [{ name: "Mudassir Ishfaq" }],
  creator: "Mudassir Ishfaq",
  appleWebApp: { capable: true, title: "Circlo", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Keeps the composer visible when the mobile keyboard opens.
  interactiveWidget: "resizes-content",
  themeColor: "#148d68",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        <AuthProvider>
          <E2EEProvider><RealtimeProvider>{children}</RealtimeProvider></E2EEProvider>
          <CapacitorDeepLinks />
          <PwaUpdatePrompt />
          <HostedAppUpdates />
          <NativeAppBridge />
        </AuthProvider>
      </body>
    </html>
  );
}
