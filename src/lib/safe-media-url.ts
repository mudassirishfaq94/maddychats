const GOOGLE_HOST = /(^|\.)googleusercontent\.com$/i;

/**
 * Avatars may be first-party media or a Google profile photo. Anything else
 * (javascript:, data:, arbitrary https hosts) must not be rendered or stored.
 */
export function safeMediaUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (value.startsWith("/api/media/")) {
    try {
      const parsed = new URL(value, "https://circlo.invalid");
      if (parsed.origin !== "https://circlo.invalid" || parsed.username || parsed.password) return null;
      if (!parsed.pathname.startsWith("/api/media/") || parsed.pathname.includes("..")) return null;
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return null;
    }
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (!GOOGLE_HOST.test(parsed.hostname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}
