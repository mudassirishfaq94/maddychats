import { rateLimit } from "@/server/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson, guardSameOrigin, clientIp } from "@/server/http";
import { consumeEmailVerification, consumeEmailVerificationCode } from "@/server/email-verification";
import { forgotPasswordSchema } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  if (!(await rateLimit(`verify-email:${clientIp(req)}`, 20, 10 * 60 * 1000)).allowed) return jsonError(429, "Too many verification attempts.");
  const body = await readJson(req);
  if (body?.code !== undefined) {
    const parsed = forgotPasswordSchema.safeParse(body);
    const code = typeof body.code === "string" ? body.code : "";
    if (!parsed.success || !/^\d{6}$/.test(code)) return jsonError(400,"Enter your email and six-digit verification code.");
    const result = await consumeEmailVerificationCode(parsed.data.email.toLowerCase(),code);
    if (result === "limited") return jsonError(429,"Too many attempts. Wait before trying again.");
    if (result === "expired") return jsonError(400,"This code has expired. Request a new code.");
    return result === "verified" ? NextResponse.json({ok:true}) : jsonError(400,"This code is invalid or has already been used.");
  }
  const token = typeof body?.token === "string" ? body.token : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return jsonError(400, "Invalid verification link.");
  const result = await consumeEmailVerification(token);
  return result === "verified" ? NextResponse.json({ ok: true }) : jsonError(400, "This verification link is invalid or has expired.");
}
