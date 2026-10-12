/** Notification data is untrusted: allow only first-party app navigation. */
export function notificationPath(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const target = new URL(value, origin);
    if (target.username || target.password) return null;
    if (target.protocol === "ziptalks:" && target.hostname === "chat") {
      const id = target.pathname.split("/").filter(Boolean)[0];
      if (!id) return "/app/chats";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
      return `/app/chats/${id}${target.search}`;
    }
    if (target.origin !== new URL(origin).origin || !["https:", "http:"].includes(target.protocol)) return null;
    if (target.pathname !== "/app" && !target.pathname.startsWith("/app/")) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return null; }
}
