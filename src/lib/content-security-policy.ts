/** Styles remain inline-compatible because the app uses dynamic CSS values. */
export function contentSecurityPolicy(nonce: string, development: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self' https://*.googleapis.com https://challenges.cloudflare.com",
    "frame-src https://www.google.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
    "report-uri /api/security/csp-report",
  ].join("; ");
}
