import type { MetadataRoute } from "next";

/** Only public editorial pages belong in search results, never accounts or chats. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/privacy", "/terms"].map(path => ({
    url: `https://circlo.chat${path}`,
    changeFrequency: "monthly" as const,
    priority: path ? 0.3 : 1,
  }));
}
