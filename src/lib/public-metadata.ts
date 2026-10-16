import type { Metadata } from "next";

export const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/whatsapp-alternative"] as const;
export function publicMetadata(path: string, title: string, description: string): Metadata {
  return {
    title: { absolute: title }, description,
    alternates: { canonical: `https://circlo.chat${path}` },
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: "Circlo", url: `https://circlo.chat${path}`, title, description, images: [{ url: "/brand/social-card.png", width: 1200, height: 630, alt: "Circlo — Your circle. Your secrets. Sealed." }] },
    twitter: { card: "summary_large_image", title, description, images: ["/brand/social-card.png"] },
  };
}
