import type { NextConfig } from "next";

const securityHeaders = [
  // API baseline and fallback. Proxy adds the nonce-based page policy in
  // report-only or enforcement mode; the root layout forwards its nonce.
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
  output: "standalone",
  // The isolated photo worker imports ESM and native libraries outside route tracing.
  outputFileTracingIncludes: {
    "/api/status": ["scripts/reconstruct-status-photo.mjs", "node_modules/sharp/**/*", "node_modules/@img/**/*"],
    "/api/upload/avatar": ["scripts/reconstruct-status-photo.mjs", "node_modules/sharp/**/*", "node_modules/@img/**/*"],
    "/api/groups/*/avatar": ["scripts/reconstruct-status-photo.mjs", "node_modules/sharp/**/*", "node_modules/@img/**/*"],
    "/api/conversations/*/background": ["scripts/reconstruct-status-photo.mjs", "node_modules/sharp/**/*", "node_modules/@img/**/*"],
  },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Cached compiler output retained old styles/version metadata across releases.
  // Keep development caching, but compile production releases from current source.
  experimental: { turbopackFileSystemCacheForBuild: false },
  reactProductionProfiling: process.env.PROFILE_BUILD === "1",
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.APP_VERSION ?? "development",
    NEXT_PUBLIC_STARTER_MODE: process.env.STARTER_MODE ?? "0",
  },
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
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/api/privacy/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      { source: "/stickers/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/gifs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
