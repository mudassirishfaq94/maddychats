import { createHmac } from "node:crypto";

/** Coturn REST credentials expire; the shared relay secret never leaves the server. */
export function callIceConfiguration(userId: string, env: { TURN_URLS?: string; TURN_SECRET?: string } = { TURN_URLS: process.env.TURN_URLS, TURN_SECRET: process.env.TURN_SECRET }, now = Date.now()) {
  const urls = (env.TURN_URLS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const valid = urls.length > 0 && urls.length <= 8 && urls.every(value =>
    /^turns?:[a-zA-Z0-9.[\]:-]+(?:\?transport=(?:udp|tcp))?$/.test(value));
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  const configured = valid && Boolean(env.TURN_SECRET && env.TURN_SECRET.length >= 32);
  const expiresAt = Math.floor(now / 1000) + 3600;
  if (configured) {
    const username = `${expiresAt}:${createHmac("sha256", env.TURN_SECRET!).update(userId).digest("hex").slice(0, 24)}`;
    iceServers.push({ urls, username, credential: createHmac("sha1", env.TURN_SECRET!).update(username).digest("base64") });
  }
  return { iceServers, relayConfigured: configured, expiresAt: expiresAt * 1000 };
}
