import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Inter, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/providers/auth-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import "./globals.css";

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
  applicationName: "Maddy Chats",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/maddy-192.png",
    apple: "/icons/maddy-192.png",
  },
  title: {
    default: "Maddy Chats — Chat. Connect. Stay in sync.",
    template: "%s · Maddy Chats",
  },
  description:
    "Maddy Chats is a real-time chat application. Secure accounts, beautiful conversations, always in sync.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Keeps the composer visible when the mobile keyboard opens.
  interactiveWidget: "resizes-content",
  themeColor: "#0f766e",
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
          <RealtimeProvider>{children}</RealtimeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
