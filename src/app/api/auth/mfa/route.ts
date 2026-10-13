import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { MFA_COOKIE, completeMfaChallenge, setAuthenticatedSession } from "@/server/authentication";
import { clientIp, guardSameOrigin, jsonError, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { toSafeUser } from "@/server/users";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;
  const token = req.cookies.get(MFA_COOKIE)?.value ?? "";
  const ip = await rateLimit(`mfa-ip:${clientIp(req)}`, 20, 10 * 60 * 1000);
  const challenge = await rateLimit(`mfa-challenge:${createHash("sha256").update(token).digest("hex")}`, 5, 5 * 60 * 1000);
  if (!ip.allowed || !challenge.allowed) return jsonError(429, "Too many verification attempts. Sign in again after waiting.");
  const body = await readJson(req);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 40) return jsonError(422, "Enter an authenticator or recovery code.");
  const user = await completeMfaChallenge(token, code);
  if (!user) return jsonError(401, "The code is invalid or already used, or sign-in has expired.");
  return setAuthenticatedSession(NextResponse.json({ user: toSafeUser(user) }), req, user, user.mfaTime);
}
