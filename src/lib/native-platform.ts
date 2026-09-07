import { Capacitor } from "@capacitor/core";

/**
 * Runtime checks shared by the web app and the installed Capacitor app.
 *
 * Do not use user-agent sniffing here: desktop Chrome can emulate an Android
 * user agent, while Capacitor exposes a reliable runtime bridge instead.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  return Capacitor.isNativePlatform();
}
