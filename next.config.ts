import type { NextConfig } from "next";

const securityHeaders = [
  // This baseline CSP blocks plug-in content and clickjacking without
  // constraining Next's framework-managed inline scripts/styles. A nonce- or
  // hash-based script policy can be added when those assets are externalized.
  { key: "Content-Security-Policy", value: "base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Voice messages need microphone access in the first-party app. Keep it
    // unavailable to cross-origin frames and continue disabling unused APIs.
    value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_VERSION ?? "development" },
  // Keep Turbopack scoped to this repository when a parent directory also
  // contains a lockfile (common in local preview workspaces).
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
