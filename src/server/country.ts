import { NextRequest } from "next/server";
import { clientIp } from "./http";

export type DetectedCountry = string | null;

export async function detectCountry(req: NextRequest): Promise<DetectedCountry> {
  const ip = clientIp(req);
  if (!ip || ip === "unknown") return null;
  const url = process.env.GEOIP_URL;
  if (!url) return null;
  try {
    const res = await fetch(url.replace("{ip}", encodeURIComponent(ip)), {
      signal: AbortSignal.timeout(2500),
      headers: { "User-Agent": "maddy-device-location/1.0" },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { country_code?: string; countryCode?: string; country?: string };
    const code =
      (body.country_code ?? body.countryCode ?? "").toString().trim().toUpperCase() ||
      (body.country ?? "").toString().trim().toUpperCase();
    if (!code || code.length !== 2) return null;
    return code;
  } catch {
    return null;
  }
}
