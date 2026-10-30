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
    // QR scanning and voice recording require first-party capture. This must
    // also work after client navigation from Chats to Profile; document policy
    // persists across SPA navigation. Cross-origin frames remain excluded.
    value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
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
  // Proxy otherwise truncates at 10 MB before the bounded multipart reader can
  // receive a full 10 MB encrypted file plus its form and encryption overhead.
  experimental: { turbopackFileSystemCacheForBuild: false, proxyClientMaxBodySize: "52mb",
    // lucide-react is imported icon-by-icon across ~40 files. Without this,
    // each named import drags in the whole icon set at bundle time, inflating
    // the JS parse cost on every app open and tab switch.
    optimizePackageImports: ["lucide-react"],
  },
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
  async redirects() {
    return [{ source: "/circlo-landing.html", destination: "/", permanent: true }, { source: "/admin/:path*", destination: "/app/admin/:path*", permanent: false }];
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
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      ...["/app/:path*", "/admin/:path*", "/invite/:path*", "/login", "/signup", "/register", "/forgot-password", "/reset-password", "/verify-email", "/device-migration", "/offline.html"].map(source => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
      { source: "/stickers/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/gifs/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
