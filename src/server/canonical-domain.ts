/** Explicit deployment origins only: headers can never choose the redirect destination. */
export function canonicalDestination(host: string | null, pathname: string, search: string, canonical: string, legacy?: string): string | null {
  if (!legacy) return null;
  const target = new URL(canonical), old = new URL(legacy);
  if (target.origin === old.origin || host?.toLowerCase() !== old.host.toLowerCase()) return null;
  if (pathname === "/device-migration") return null;
  if (pathname === "/api/auth/google") return new URL(pathname + search, target.origin).href;
  if (pathname.startsWith("/api/")) return null;
  if (pathname === "/app" || pathname.startsWith("/app/")) return new URL("/device-migration", old.origin).href;
  target.pathname = pathname;
  target.search = search;
  target.hash = "";
  return target.href;
}
