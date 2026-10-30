/** Browser request errors can include Cookie/Authorization headers. Never print them. */
export function redactTestOutput(value: string): string {
  return value.replace(/^(\s*(?:[-*]\s*)?(?:cookie|set-cookie|authorization):).*$/gim, "$1 [redacted]")
    .replace(/\bmaddy_(?:session|refresh)=[^\s;,'"\]]+/g, "session=[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]");
}
