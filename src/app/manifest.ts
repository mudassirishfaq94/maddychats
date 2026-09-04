import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZipTalk",
    short_name: "ZipTalk",
    description: "Private realtime conversations. App by Mudassir Ishfaq.",
    start_url: "/app/chats",
    scope: "/",
    display: "standalone",
    background_color: "#0b1211",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/ziptalk-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/ziptalk-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/ziptalk-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
