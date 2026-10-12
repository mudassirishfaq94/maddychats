import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/server/users";
import { issueEmailVerification, verificationDeliveryConfigured } from "@/server/email-verification";
import { guardSameOrigin, jsonError, readJson, clientIp } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  const rl = await rateLimit(`verify-resend:${clientIp(req)}`, 3, 15 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, "Please wait before requesting another verification email.");
  if (!verificationDeliveryConfigured()) return jsonError(503, "Verification email delivery is not configured. Your account remains unverified.");
  const body = await readJson(req);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email && /^\S+@\S+\.\S+$/.test(email)) {
    const user = await findUserByEmail(email);
    if (user && !user.emailVerifiedAt) await issueEmailVerification(user);
  }
  return NextResponse.json({ ok: true, message: "Request processed. If your account needs verification and delivery succeeds, check your inbox. Wait at least one minute before resending." });
}
