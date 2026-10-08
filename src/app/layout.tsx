import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { headers } from "next/headers";
import { Inter, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/providers/auth-provider";
import { HostedAppUpdates } from "@/components/hosted-app-updates";
import { CapacitorDeepLinks } from "@/components/capacitor-deep-links";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { NativeAppBridge } from "@/components/native-app-bridge";
import { PerformanceMonitor } from "@/components/performance-monitor";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "optional",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "optional",
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
  themeColor: "#2563EB",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
        <AuthProvider>
          <PerformanceMonitor>{children}</PerformanceMonitor>
          <CapacitorDeepLinks />
          <PwaUpdatePrompt />
          <HostedAppUpdates />
          <NativeAppBridge />
        </AuthProvider>
      </body>
    </html>
  );
}
