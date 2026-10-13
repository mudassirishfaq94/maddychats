/** Styles remain inline-compatible because the app uses dynamic CSS values. */
export function contentSecurityPolicy(nonce: string, development: boolean, authDomain?: string) {
  const firebase = authDomain && /^[a-z0-9.-]+$/.test(authDomain) ? ` https://${authDomain}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com${firebase}`,
    `frame-src https://www.google.com https://www.recaptcha.net https://*.firebaseapp.com${firebase}`,
    "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
    "report-uri /api/security/csp-report",
  ].join("; ");
}
