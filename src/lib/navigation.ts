/** Resolve browser reloads against this deployment, rejecting off-site redirects. */
export function sameOriginDestination(path: string, origin: string): string {
  const base = new URL(origin);
  const destination = new URL(path, base.origin);
  if (!["http:", "https:"].includes(base.protocol) || destination.origin !== base.origin) {
    throw new Error("Navigation must stay on the application origin.");
  }
  return destination.href;
}

/** Auth changes require a full request so stale prefetched pages cannot win. */
export function navigateWithReload(path: string): void {
  window.location.assign(sameOriginDestination(path, window.location.origin));
}
