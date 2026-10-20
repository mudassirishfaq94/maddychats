import { isIP } from "node:net";

function address(value: string | null): string | null {
  if (!value || value.length > 64) return null;
  const ip = value.trim();
  if (!isIP(ip) || ip.includes("%")) return null;
  if (ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4) return ip.slice(7);
  return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip;
}

/** Trust deployment configuration, never a caller's choice of proxy headers. */
export function resolveClientIp(headers: Headers, options: { render: boolean; production: boolean; trustedHops?: string }): string {
  // Render's public ingress is behind Cloudflare. Never fall back to its
  // client-prependable X-Forwarded-For chain when the edge header is absent.
  if (options.render) return address(headers.get("cf-connecting-ip")) ?? "unknown";
  const configured = options.trustedHops;
  if (configured && /^(?:[1-9]|1[0-6])$/.test(configured)) {
    const chain = headers.get("x-forwarded-for");
    if (!chain || chain.length > 2048) return "unknown";
    const entries = chain.split(",");
    return address(entries[entries.length - Number(configured)] ?? null) ?? "unknown";
  }
  if (options.production) return "unknown";
  return address(headers.get("x-forwarded-for")?.split(",")[0] ?? null) ?? address(headers.get("x-real-ip")) ?? "unknown";
}
