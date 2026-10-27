import { NextResponse } from "next/server";
import { challengeConfiguration } from "@/server/turnstile";

export const dynamic = "force-dynamic";
export function GET() {
  const config = challengeConfiguration();
  return NextResponse.json({ enabled: config.enabled, siteKey: config.configured ? config.siteKey : null },
    { headers: { "Cache-Control": "no-store" } });
}
