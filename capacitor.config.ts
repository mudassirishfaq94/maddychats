import type { CapacitorConfig } from "@capacitor/cli";

/**
 * ZipTalk Android — Capacitor wrapper.
 *
 * The WebView loads the hosted Vercel deployment directly.  All server-side
 * logic (API routes, Socket.IO, Neon DB, E2EE key exchange) stays on the
 * server.  The native shell adds platform capabilities: push notifications,
 * camera/microphone access, file system, haptics, status bar control, and
 * Play Store distribution.
 *
 * For local development, uncomment the `url` line and point it at your
 * dev server (e.g. http://10.0.2.2:3000 for Android emulator).
 */
const config: CapacitorConfig = {
  appId: "app.ziptalks.android",
  appName: "ZipTalk",
  webDir: "out",
  server: {
    // Production: load the hosted app directly.
    url: "https://ziptalks.vercel.app",
    // Cleartext for local dev (emulator / device on same network):
    // url: "http://10.0.2.2:3000",
    // allowNavigation: ["*"],
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: "#0b1211",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      spinnerColor: "#0f766e",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b1211",
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
    },
  },
};

export default config;
