import { verifyFreshAuthentication } from "@/server/authentication";
import { rateLimit } from "@/server/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { deleteAccount } from "@/server/privacy";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { SESSION_COOKIE } from "@/server/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guardSameOrigin(req);
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return jsonError(401, "Not authenticated.");

  const body = await readJson(req);
  if (!body) return jsonError(400, "Invalid request body.");

  // Require typing "DELETE" to confirm
  if (body.confirm !== "DELETE") {
    return jsonError(422, 'Type DELETE to confirm account deletion.');
  }

  const rl = await rateLimit(`delete-account:${user.id}`, 5, 10 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, "Too many authentication attempts.");
  if (!(await verifyFreshAuthentication(user.id, body))) return jsonError(403, "Confirm your password and authenticator/recovery code, or sign in again before deleting your account.");

  await deleteAccount(user.id);

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
