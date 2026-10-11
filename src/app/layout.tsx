import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { headers } from "next/headers";
import { Inter, Sora } from "next/font/google";
import { AuthProvider } from "@/components/providers/auth-provider";
import { HostedAppUpdates } from "@/components/hosted-app-updates";
import { CapacitorDeepLinks } from "@/components/capacitor-deep-links";
import { PwaUpdatePrompt } from "@/components/pwa-update-prompt";
import { NativeAppBridge } from "@/components/native-app-bridge";
import { PerformanceMonitor } from "@/components/performance-monitor";
import { getSessionUser } from "@/server/session";
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
  applicationName: "Circlo",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/circlo-mark.svg",
    apple: "/icons/circlo-192.png",
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
  const [requestHeaders, initialUser] = await Promise.all([headers(), getSessionUser()]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
        <AuthProvider initialUser={initialUser}>
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
