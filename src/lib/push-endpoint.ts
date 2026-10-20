/** Only browser-operated push services may receive server-side notification requests. */
export function isSupportedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    return ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) || url.hostname.endsWith(".notify.windows.com");
  } catch { return false; }
}
