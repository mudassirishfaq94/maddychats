import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import Script from "next/script";
import { headers } from "next/headers";
import { Inter, Sora } from "next/font/google";
import { AuthProvider } from "@/components/providers/auth-provider";
import { HostedAppUpdates } from "@/components/hosted-app-updates";
import { CapacitorDeepLinks } from "@/components/capacitor-deep-links";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { NativeAppBridge } from "@/components/native-app-bridge";
import { PerformanceMonitor } from "@/components/performance-monitor";
import { InstalledLaunch, LaunchScreen } from "@/components/installed-launch";
import { getDeviceSetupUser } from "@/server/session";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "optional",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "optional",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://circlo.chat"),
  applicationName: "Circlo",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/circlo-mark.svg?v=linked-c-2",
    apple: "/icons/circlo-192.png?v=linked-c-2",
  },
  title: {
    default: "Circlo — Your circle. Your secrets. Sealed.",
    template: "%s · Circlo",
  },
  description:
    "Your circle. Your secrets. Sealed. Connect through end-to-end encrypted conversations with Circlo.",
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
  themeColor: "#151719",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
        <Suspense fallback={<LaunchScreen />}><SessionProviders>{children}</SessionProviders></Suspense>
      </body>
    </html>
  );
}

async function SessionProviders({ children }: { children: ReactNode }) {
  const initialUser = await getDeviceSetupUser();
  return <><InstalledLaunch /><AuthProvider initialUser={initialUser}>
          <PerformanceMonitor>{children}</PerformanceMonitor>
          <CapacitorDeepLinks />
          <PwaUpdatePrompt />
          <HostedAppUpdates />
          <NativeAppBridge />
        </AuthProvider></>;
}
