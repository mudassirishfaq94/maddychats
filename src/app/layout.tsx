import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
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
};

/**
 * Applies the persisted theme (light | dark | system) before first paint and
 * tracks OS-level scheme changes while in System mode.
 */
const themeInit = `(function(){try{
var t=localStorage.getItem('maddy-theme')||'system';
var mq=window.matchMedia('(prefers-color-scheme: light)');
var apply=function(light){document.documentElement.classList.toggle('light',light)};
apply(t==='light'||(t==='system'&&mq.matches));
mq.addEventListener?mq.addEventListener('change',function(e){var p=localStorage.getItem('maddy-theme')||'system';if(p==='system')apply(e.matches)}):0;
}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <AuthProvider>
          <RealtimeProvider>{children}</RealtimeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
