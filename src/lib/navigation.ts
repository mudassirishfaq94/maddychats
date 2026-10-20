/** Resolve browser reloads against this deployment, rejecting off-site redirects. */
export function sameOriginDestination(path: string, origin: string): string {
  const base = new URL(origin);
  const destination = new URL(path, base.origin);
  if (!["http:", "https:"].includes(base.protocol) || destination.origin !== base.origin) {
    throw new Error("Navigation must stay on the application origin.");
  }
  return destination.href;
}

/** Post-auth return paths must stay on this origin as a relative URL. */
export function safeReturnPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || next.length > 512 || /[\\\u0000-\u0020]/.test(next) || next.includes("://")) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  try {
    const origin = "https://circlo.invalid";
    const destination = new URL(next, origin);
    if (destination.origin !== origin || destination.username || destination.password) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}` || fallback;
  } catch {
    return fallback;
  }
}

/** Auth changes require a full request so stale prefetched pages cannot win. */
export function navigateWithReload(path: string): void {
  window.location.assign(sameOriginDestination(path, window.location.origin));
}
