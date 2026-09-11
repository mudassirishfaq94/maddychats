import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Circlo",
    short_name: "Circlo",
    description: "Your people, your conversations.",
    start_url: "/app/chats",
    scope: "/",
    display: "standalone",
    orientation: "any",
    categories: ["social", "communication"],
    shortcuts: [
      { name: "Chats", url: "/app/chats", icons: [{ src: "/icons/ziptalk-192.png", sizes: "192x192" }] },
      { name: "People", url: "/app/people", icons: [{ src: "/icons/ziptalk-192.png", sizes: "192x192" }] },
    ],
    background_color: "#111027",
    theme_color: "#6255d8",
    icons: [
      { src: "/icons/ziptalk-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/ziptalk-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/ziptalk-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
