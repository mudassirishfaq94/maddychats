import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Maddy Chats",
    short_name: "Maddy Chats",
    description: "Private realtime conversations with the people who matter.",
    start_url: "/app/chats",
    scope: "/",
    display: "standalone",
    background_color: "#0b1211",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/maddy-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/maddy-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maddy-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
