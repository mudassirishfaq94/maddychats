/** Compare complete origins, not only hostnames. Paths and credentials are invalid Origin values. */
export function originAllowed(value: string, configuredOrigin: string, requestOrigin: string): boolean {
  try {
    const source = new URL(value);
    if (!["http:", "https:"].includes(source.protocol) || source.username || source.password ||
        source.pathname !== "/" || source.search || source.hash) return false;
    return [configuredOrigin, requestOrigin].some(target => {
      const allowed = new URL(target);
      return ["http:", "https:"].includes(allowed.protocol) && source.origin === allowed.origin;
    });
  } catch { return false; }
}
