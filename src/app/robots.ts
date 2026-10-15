import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/api/", "/login", "/signup", "/register", "/device-migration", "/invite/", "/forgot-password", "/reset-password", "/verify-email"] },
    sitemap: "https://circlo.chat/sitemap.xml",
    host: "https://circlo.chat",
  };
}
