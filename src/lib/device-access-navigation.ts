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

/** An admin destination changes routing only; server role/MFA checks still authorize it. */
export function adminDestination(next?: string): string | null {
  const target = deviceAccessDestination(next);
  const url = new URL(target, "https://navigation.invalid");
  return url.pathname === "/app/admin" || url.pathname.startsWith("/app/admin/")
    ? url.pathname + url.search + url.hash : null;
}

export function postSignInPath(next?: string): string {
  return adminDestination(next) ?? deviceAccessPath(next);
}
