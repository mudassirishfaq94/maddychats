import { NextRequest, NextResponse } from "next/server";
import { fieldErrors, resetPasswordSchema } from "@/lib/schemas";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { consumePasswordReset } from "@/server/password-reset";
import { AUTH_RATE_LIMIT, rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/http";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const rl = rateLimit(`reset:${clientIp(req)}`, AUTH_RATE_LIMIT.limit, AUTH_RATE_LIMIT.windowMs);
  if (!rl.allowed) return jsonError(429, "Too many attempts. Please try again later.");
  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Please fix the highlighted fields.", fieldErrors(parsed.error));
  const changed = await consumePasswordReset(parsed.data.token, parsed.data.password);
  if (!changed) return jsonError(400, "This reset link is invalid or has expired.");
  return NextResponse.json({ ok: true });
}
