import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/api/", "/device-migration", "/invite/", "/reset-password", "/verify-email"] },
    sitemap: "https://circlo.chat/sitemap.xml",
    host: "https://circlo.chat",
  };
}
