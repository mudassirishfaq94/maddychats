import { androidAssetLinks } from "@/lib/android-asset-links";

export const dynamic = "force-dynamic";

export function GET() {
  const links = androidAssetLinks(process.env);
  if (!links) return Response.json({ error: "Android app verification is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(links, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
