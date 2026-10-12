import { NextRequest } from "next/server";
import { readBoundedBody, clientIp } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const key = createHash("sha256").update(clientIp(req)).digest("hex");
  if (!(await rateLimit(`csp:${key}`, 20, 60000)).allowed) return new Response(null, { status: 429 });
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(await readBoundedBody(req, 16384)));
    const report = data && typeof data === "object" && "csp-report" in data ? data["csp-report"] : null;
    if (!report || typeof report !== "object") return new Response(null, { status: 400 });
    const directive = "effective-directive" in report ? report["effective-directive"] : null;
    // Reports are attacker-controlled. Retain no URLs, query strings, samples, IPs or identifiers.
    const known = new Set(["script-src-elem", "script-src", "style-src", "style-src-elem", "connect-src", "img-src", "font-src", "frame-src", "worker-src", "media-src", "base-uri", "form-action", "object-src"]);
    console.info("[csp]", typeof directive === "string" && known.has(directive) ? directive : "other");
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 400 }); }
}
