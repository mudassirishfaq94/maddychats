import { Capacitor } from "@capacitor/core";

/**
 * Runtime checks shared by the web app and the installed Capacitor app.
 *
 * Do not use user-agent sniffing here: desktop Chrome can emulate an Android
 * user agent, while Capacitor exposes a reliable runtime bridge instead.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  // The production Android shell is an app-owned WebView while the full
  // Capacitor client is being rebuilt. It advertises this stable marker so it
  // receives native-safe behaviour (no PWA worker or browser update loop).
  return Capacitor.isNativePlatform() || /ZipTalkAndroid\//.test(navigator.userAgent);
}
