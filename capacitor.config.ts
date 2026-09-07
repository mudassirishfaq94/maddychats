import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

/**
 * ZipTalk Android — Capacitor wrapper.
 *
 * The Android launcher owns the application window and native capabilities.
 * The hosted origin remains the backend and UI delivery origin because this
 * Next.js app has server-rendered authenticated routes and API handlers; it
 * is not a static site that can be exported into `webDir`.
 *
 * For local development, uncomment the `url` line and point it at your
 * dev server (e.g. http://10.0.2.2:3000 for Android emulator).
 */
const config: CapacitorConfig = {
  appId: "app.ziptalks.android",
  appName: "ZipTalk",
  webDir: "out",
  server: {
    // This is intentionally an in-app Capacitor WebView, not a browser/TWA.
    // Keep navigation constrained to our first-party origin.
    url: "https://ziptalks.vercel.app",
    allowNavigation: ["ziptalks.vercel.app"],
    // Cleartext for local dev (emulator / device on same network):
    // url: "http://10.0.2.2:3000",
    // allowNavigation: ["*"],
    androidScheme: "https",
  },
  android: {
    // Production is HTTPS-only. Do not allow an attachment or redirect to
    // downgrade the app window to HTTP.
    allowMixedContent: false,
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
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Dark,
    },
  },
};

export default config;
