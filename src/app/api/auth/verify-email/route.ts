import { rateLimit } from "@/server/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson, guardSameOrigin, clientIp } from "@/server/http";
import { consumeEmailVerification } from "@/server/email-verification";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  if (!(await rateLimit(`verify-email:${clientIp(req)}`, 20, 10 * 60 * 1000)).allowed) return jsonError(429, "Too many verification attempts.");
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return jsonError(400, "Invalid verification link.");
  const result = await consumeEmailVerification(token);
  return result === "verified" ? NextResponse.json({ ok: true }) : jsonError(400, "This verification link is invalid or has expired.");
}
