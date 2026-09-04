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
  applicationName: "ZipTalk",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/ziptalk-192.png",
    apple: "/icons/ziptalk-192.png",
  },
  title: {
    default: "ZipTalk — Chat. Connect. Stay in sync.",
    template: "%s · ZipTalk",
  },
  description:
    "ZipTalk is a real-time chat application by Mudassir Ishfaq.",
  authors: [{ name: "Mudassir Ishfaq" }],
  creator: "Mudassir Ishfaq",
  appleWebApp: { capable: true, title: "ZipTalk", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
