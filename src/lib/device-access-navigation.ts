/** Device setup is post-authentication; only return to private app screens. */
export function deviceAccessDestination(next?: string): string {
  if (!next || !/^\/app(?:[/?#]|$)/.test(next) || /[\\\u0000-\u0020]/.test(next)) return "/app";
  if (next.split(/[?#]/)[0] === "/app/device-access") return "/app";
  return next;
}

export function deviceAccessPath(next?: string): string {
  // Reauthentication may already be returning to the setup screen.
  if (next?.startsWith("/app/device-access?") && !/[\\\u0000-\u0020]/.test(next)) return next;
  return `/app/device-access?next=${encodeURIComponent(deviceAccessDestination(next))}`;
}
