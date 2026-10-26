import type { MetadataRoute } from "next";
import { PUBLIC_PATHS } from "@/lib/public-metadata";

/** Only public editorial pages belong in search results, never accounts or chats. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map(path => ({
    url: `https://circlo.chat${path}`,
    lastModified: path === "/" ? new Date("2026-10-26T00:00:00.000Z") : undefined,
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : path === "/whatsapp-alternative" ? 0.7 : 0.3,
  }));
}
